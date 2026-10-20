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
import { attachTokenBehavior, LOCKED_LABEL } from "./inline-widget";
import type SecureInlinePlugin from "./main";
import { renderSecureBlock } from "./secure-block-widget";
import { scanSecureFences } from "./secure-fences";
import { renderSecureProperties } from "./secure-properties-widget";

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
    private revealOnFocus: boolean,
    private revealAll: boolean,
  ) {
    super();
  }

  eq(other: SecureTokenWidget): boolean {
    return (
      other.token === this.token &&
      other.revealOnFocus === this.revealOnFocus &&
      other.revealAll === this.revealAll
    );
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.addClass("secure-inline", "secure-inline-live");
    attachTokenBehavior(this.plugin, span, this.token, LOCKED_LABEL, {
      revealOnAttach: this.revealOnFocus || this.plugin.revealAll,
      revealedPrefix: "sec:v1:",
    });
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
    private revealAll: boolean,
  ) {
    super();
  }

  eq(other: SecureBlockWidget): boolean {
    return (
      other.armored === this.armored && other.revealAll === this.revealAll
    );
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

class SecurePropertiesWidget extends WidgetType {
  constructor(
    private plugin: SecureInlinePlugin,
    private content: string,
    private revealAll: boolean,
  ) {
    super();
  }

  eq(other: SecurePropertiesWidget): boolean {
    return (
      other.content === this.content && other.revealAll === this.revealAll
    );
  }

  toDOM(): HTMLElement {
    const el = document.createElement("div");
    renderSecureProperties(this.plugin, this.content, el);
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
  const secureFences = scanSecureFences(view.state.doc.toString());
  for (const range of view.visibleRanges) {
    const text = view.state.doc.sliceString(range.from, range.to);
    INLINE_TOKEN_RE.lastIndex = 0;
    for (const match of text.matchAll(INLINE_TOKEN_RE)) {
      const index = match.index ?? 0;
      const from = range.from + index;
      const to = from + match[0].length;
      if (
        secureFences.some(
          (fence) => from >= fence.from && to <= fence.to,
        )
      ) {
        continue;
      }
      const focused = selectionIntersects(view.state, from, to);
      if (focused && !plugin.settings.inlineRevealOnFocus) {
        continue;
      }
      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new SecureTokenWidget(
            plugin,
            match[0],
            focused && plugin.settings.inlineRevealOnFocus,
            plugin.revealAll,
          ),
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
  for (const fence of scanSecureFences(state.doc.toString())) {
    if (selectionIntersects(state, fence.from, fence.to)) {
      continue;
    }
    if (fence.kind === "secure-properties") {
      builder.add(
        fence.from,
        fence.to,
        Decoration.replace({
          block: true,
          widget: new SecurePropertiesWidget(
            plugin,
            fence.content,
            plugin.revealAll,
          ),
        }),
      );
      continue;
    }
    if (!fence.isArmored) {
      continue;
    }
    builder.add(
      fence.from,
      fence.to,
      Decoration.replace({
        block: true,
        widget: new SecureBlockWidget(
          plugin,
          fence.content.trim(),
          plugin.revealAll,
        ),
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
