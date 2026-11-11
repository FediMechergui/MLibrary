declare module "page-flip" {
  export class PageFlip {
    constructor(
      element: HTMLElement,
      settings: {
        width: number;
        height: number;
        size?: string;
        startPage?: number;
        usePortrait?: boolean;
        autoSize?: boolean;
        drawShadow?: boolean;
        maxShadowOpacity?: number;
        flippingTime?: number;
        useMouseEvents?: boolean;
        mobileScrollSupport?: boolean;
        showPageCorners?: boolean;
        disableFlipByClick?: boolean;
      },
    );
    on(name: string, callback: (event: { data: unknown }) => void): void;
    loadFromImages(images: string[]): void;
    flipNext(): void;
    flipPrev(): void;
    destroy(): void;
  }
}
