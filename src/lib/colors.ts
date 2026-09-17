import Color from "colorjs.io";
import { stVars } from "../project.st.css";

export type InterpolationSpace = "oklch" | "lch" | "oklab" | "lab" | "hsl" | "hwb" | "srgb";
export type HueMethod = "shorter" | "longer";
export type ColorDetails = { hex: string; rgb: string; hsl: string };
export type ContrastMode = "light" | "dark";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, precision = 0) => {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
};

export const getContrastMode = (
    background: string,
    light = stVars.uiFgColor,
    dark = stVars.uiFgDark,
): ContrastMode => {
    const lightContrast = Color.contrastWCAG21(background, light);
    const darkContrast = Color.contrastWCAG21(background, dark);

    return lightContrast >= darkContrast ? "light" : "dark";
};

export const createPalette = (sourceColors: string[], steps: number, space: InterpolationSpace, hue: HueMethod) => {
    if (sourceColors.length < 2) return sourceColors.map((color) => new Color(color));
    const ranges = sourceColors.slice(0, -1).map((color, index) => new Color(color).range(
        new Color(sourceColors[index + 1]),
        { space, hue, outputSpace: "srgb" },
    ));

    return Array.from({ length: steps }, (_, index) => {
        const position = (index / Math.max(steps - 1, 1)) * ranges.length;
        const rangeIndex = Math.min(Math.floor(position), ranges.length - 1);
        const localPosition = Math.min(position - rangeIndex, 1);
        return ranges[rangeIndex](localPosition).toGamut("srgb").to("srgb");
    });
};

export const describeColor = (color: Color): ColorDetails => {
    const srgb = color.to("srgb").toGamut("srgb");
    const [red, green, blue] = srgb.coords.map((coordinate) => Math.round(clamp(coordinate ?? 0, 0, 1) * 255));
    const [rawHue, saturation, lightness] = srgb.to("hsl").coords;
    const hue = typeof rawHue === "number" && Number.isFinite(rawHue) ? rawHue : 0;
    return {
        hex: srgb.toString({ format: "hex", collapse: false }).toUpperCase(),
        rgb: `${red}, ${green}, ${blue}`,
        hsl: `${round(hue, 1)}°, ${round(saturation ?? 0, 1)}%, ${round(lightness ?? 0, 1)}%`,
    };
};
