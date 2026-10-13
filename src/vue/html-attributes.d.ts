import 'vue';

/** HTML/SVG custom data attributes are valid DOM metadata, not arbitrary props. */
declare module 'vue' {
  interface HTMLAttributes {
    [name: `data-${string}`]: string | number | boolean | undefined;
  }
  interface SVGAttributes {
    [name: `data-${string}`]: string | number | boolean | undefined;
  }
}
