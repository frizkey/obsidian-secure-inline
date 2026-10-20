import {
  EditorState,
  RangeSetBuilder,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import { INLINE_TOKEN_RE } from "./block";
import { attachTokenBehavior } from "./inline-widget";
import type SecureInlinePlugin from "./main";
import { renderSecureBlock } from "./secure-block-widget";

function selectionIntersects(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from,
  );
}

class SecureTokenWidget extends WidgetType {
  constructor(
    private plugin: SecureInlinePlugin,
    private token: string,
  ) {
    super();
  }

  eq(other: SecureTokenWidget): boolean {
    return other.token === this.token;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.addClass("secure-inline", "secure-inline-live");
    span.setText("Secure");
    attachTokenBehavior(this.plugin, span, this.token, "Secure");
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class SecureBlockWidget extends WidgetType {
  constructor(
    private plugin: SecureInlinePlugin,
    private armored: string,
  ) {
    super();
  }

  eq(other: SecureBlockWidget): boolean {
    return other.armored === this.armored;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.addClass("secure-inline-live-block");
    renderSecureBlock(this.plugin, this.armored, el);
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildInlineDecorations(
  view: EditorView,
  plugin: SecureInlinePlugin,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of view.visibleRanges) {
    const text = view.state.doc.sliceString(range.from, range.to);
    INLINE_TOKEN_RE.lastIndex = 0;
    for (const match of text.matchAll(INLINE_TOKEN_RE)) {
      const index = match.index ?? 0;
      const from = range.from + index;
      const to = from + match[0].length;
      if (selectionIntersects(view.state, from, to)) {
        continue;
      }
      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new SecureTokenWidget(plugin, match[0]),
        }),
      );
    }
  }
  return builder.finish();
}

function buildBlockDecorations(
  state: EditorState,
  plugin: SecureInlinePlugin,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const line = doc.line(lineNo);
    const opening = line.text.match(/^(`{3,}|~{3,})(secure|age)\s*$/);
    if (!opening) {
      continue;
    }
    const fence = opening[1];
    const fenceChar = fence[0];
    let closing = null;
    for (let endLineNo = lineNo + 1; endLineNo <= doc.lines; endLineNo += 1) {
      const endLine = doc.line(endLineNo);
      const trimmed = endLine.text.trim();
      if (
        trimmed.length >= fence.length &&
        trimmed.split("").every((char) => char === fenceChar)
      ) {
        closing = endLine;
        lineNo = endLineNo;
        break;
      }
    }
    if (!closing) {
      break;
    }
    if (selectionIntersects(state, line.from, closing.to)) {
      continue;
    }
    const innerFrom = line.to + 1;
    const armored = doc.sliceString(innerFrom, closing.from).trim();
    builder.add(
      line.from,
      closing.to,
      Decoration.replace({
        block: true,
        widget: new SecureBlockWidget(plugin, armored),
      }),
    );
  }
  return builder.finish();
}

export function registerLivePreview(plugin: SecureInlinePlugin): void {
  const inlinePlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildInlineDecorations(view, plugin);
      }

      update(update: ViewUpdate): void {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet
        ) {
          this.decorations = buildInlineDecorations(update.view, plugin);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );

  const blockField = StateField.define<DecorationSet>({
    create: (state) => buildBlockDecorations(state, plugin),
    update: (_decorations, transaction) =>
      buildBlockDecorations(transaction.state, plugin),
    provide: (field) => EditorView.decorations.from(field),
  });

  const extensions: Extension[] = [inlinePlugin, blockField];
  plugin.registerEditorExtension(extensions);
}
