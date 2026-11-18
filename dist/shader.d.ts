/**
 * The quicksilver shader: letters drawn from a distance field as liquid metal. Taken unchanged from
 * hraness/yaptake site/analytics/src/mark.ts (8bdce88), so a word baked and drawn here matches
 * yaptake.com's closing wordmark pixel for pixel. One fragment shader draws a bevelled rim from the
 * field's outline; the metal is that surface reflecting a small painted studio, or (as the wordmark
 * uses it) a plain polished silver with a dark edge for light pages.
 */
export type Shape = readonly [rimWidth: number, rimHeight: number, poolDepth: number, swellHeight: number];
export type Frame = {
    /** The field's square on the canvas in canvas pixels: left, top, side. */
    box: readonly [number, number, number];
    time: number;
    /** The pointer in field space (0 to 1 each way) and its presence, 0 to 1. */
    pointer: readonly [number, number, number];
    shape: Shape;
    shadow: number;
    exposure: number;
    /** 0 for the studio's reflections, 1 for plain light silver. */
    plain: number;
    /** The plain silver's dark polished edge: 1 to stand out on a light surface, 0 on a dark one. */
    edge: number;
    /** How far the liquid reaches without a pool: 1 for letters. */
    liquid: number;
};
export type Renderer = {
    ring(x: number, y: number, time: number): void;
    draw(frame: Frame): void;
    /** Frees the GPU context. The renderer draws nothing afterwards. */
    release(): void;
};
/** The shader on one canvas. Nothing is drawn until `draw`; undefined where WebGL is not available. */
export declare function createRenderer(canvas: HTMLCanvasElement, field: TexImageSource & {
    width: number;
}, keep?: boolean): Renderer | undefined;
