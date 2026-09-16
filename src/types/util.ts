import { ComponentChildren, JSX, RenderableProps, ButtonHTMLAttributes, InputHTMLAttributes } from "preact";

export type Extend<Base, Extension> = Omit<Base, keyof Extension> & Extension;

export type MaybePromise<T> = T extends Promise<any> ? T : Promise<T>;
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

type RGB = `rgb(${string})`
type RGBA = `rgba(${string})`
type HEX = `#${string}`
type HSL = `hsl(${string})`
type HSLA = `hsla(${string})`
type VAR = `var(${string})`

type CssGlobals = 'inherit' | 'initial' | 'revert' | 'unset'

export type CssColor =
  | 'currentColor'
  | 'transparent'
  | RGB
  | RGBA
  | HEX
  | HSL
  | HSLA
  | VAR
  | CssGlobals

type HTMLAttributes<T extends HTMLElement> = Extend<JSX.HTMLAttributes<T>, {
    class?: string;
    className?: string;
}>;

type FunctionComponent<P = {}> = {
	(props: Extend<RenderableProps<P>, {
        class?: string | undefined | Array<string | undefined>;
        className?: string | undefined;
    }>, context?: any): ComponentChildren;
    displayName?: string;
    defaultProps?: Partial<P> | undefined;
}

type InferredAttributes<T extends HTMLElement> = 
  T extends HTMLButtonElement ? ButtonHTMLAttributes<T>
    : T extends HTMLInputElement ? InputHTMLAttributes
        : HTMLAttributes<T>;

export type FnComponent<T = HTMLElement, P = {}> = T extends HTMLElement
  ? FunctionComponent<Extend<InferredAttributes<T>, P>>
  : FunctionComponent<Extend<T, {
    class?: string;
    className?: string;
  }>>;

export type GenericComponent<T> = FunctionComponent<RenderableProps<T>>;