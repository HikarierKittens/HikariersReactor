/** Public read-only views of shared snapshots; no runtime cloning or freezing. */
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
