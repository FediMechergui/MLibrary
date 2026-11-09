import type { ReadingMark } from "../types";
import { highlightColors, intersectMarks } from "./annotations";

export function selectedOffsets(
  root: HTMLElement,
  selector = "[data-reading-text]",
) {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const block = (node: Node) =>
    (node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement
    )?.closest<HTMLElement>(selector);
  const first = block(range.startContainer),
    last = block(range.endContainer);
  if (!first || !last || !root.contains(first) || !root.contains(last))
    return null;
  const offset = (el: HTMLElement, node: Node, index: number) => {
    const before = root.ownerDocument.createRange();
    before.selectNodeContents(el);
    before.setEnd(node, index);
    return (
      before.cloneContents().textContent!.length +
      Number(el.dataset.offset || 0)
    );
  };
  const start = offset(first, range.startContainer, range.startOffset),
    end = offset(last, range.endContainer, range.endOffset);
  if (end <= start) return null;
  return { start, end, text: range.cloneContents().textContent || "" };
}

// PDF text spans have transforms; preserve them and only annotate their text nodes.
export function paintTextMarks(root: HTMLElement, marks: ReadingMark[]) {
  root
    .querySelectorAll("mark[data-mark]")
    .forEach((el) => el.replaceWith(...el.childNodes));
  root.normalize();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  let offset = 0;
  nodes.forEach((text) => {
    const value = text.data,
      start = offset;
    offset += value.length;
    const pieces = intersectMarks(marks, start, offset);
    if (!pieces.some((p) => p.mark)) return;
    const fragment = document.createDocumentFragment();
    pieces.forEach((piece) => {
      const valuePart = value.slice(piece.start - start, piece.end - start);
      if (!piece.mark) fragment.append(valuePart);
      else {
        const el = document.createElement("mark");
        el.dataset.mark = piece.mark.id;
        el.style.backgroundColor = highlightColors[piece.mark.color] + "99";
        el.textContent = valuePart;
        fragment.append(el);
      }
    });
    text.replaceWith(fragment);
  });
}
