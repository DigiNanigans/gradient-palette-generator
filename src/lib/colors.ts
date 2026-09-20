import Color from "colorjs.io";
import { stVars } from "../project.st.css";

export type InterpolationSpace = "oklch" | "lch" | "oklab" | "lab" | "hsl" | "hwb" | "srgb";
export type HueMethod = "shorter" | "longer";
export type ColorDetails = {
    hex: string;
    rgb: string;
    hsl: string;
    hue: number;
    saturation: number;
    lightness: number;
};

export type ContrastMode = "light" | "dark";
export type CubicBezierCurve = { x1: number; y1: number; x2: number; y2: number };

export const LINEAR_EASING_CURVE: CubicBezierCurve = {
    x1: 1 / 3,
    y1: 1 / 3,
    x2: 2 / 3,
    y2: 2 / 3,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, precision = 0) => {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
};

const cubicCoordinate = (position: number, firstControl: number, secondControl: number) => {
    const remaining = 1 - position;
    return (3 * remaining * remaining * position * firstControl)
        + (3 * remaining * position * position * secondControl)
        + (position * position * position);
};

const cubicDerivative = (position: number, firstControl: number, secondControl: number) => {
    const remaining = 1 - position;
    return (3 * remaining * remaining * firstControl)
        + (6 * remaining * position * (secondControl - firstControl))
        + (3 * position * position * (1 - secondControl));
};

export const applyCubicBezier = (progress: number, curve: CubicBezierCurve) => {
    const target = clamp(progress, 0, 1);
    if (target === 0 || target === 1) return target;

    let position = target;

    for (let iteration = 0; iteration < 8; iteration += 1) {
        const error = cubicCoordinate(position, curve.x1, curve.x2) - target;
        if (Math.abs(error) < 0.000001) {
            return clamp(cubicCoordinate(position, curve.y1, curve.y2), 0, 1);
        }

        const derivative = cubicDerivative(position, curve.x1, curve.x2);
        if (Math.abs(derivative) < 0.000001) break;
        position = clamp(position - (error / derivative), 0, 1);
    }

    let lower = 0;
    let upper = 1;

    for (let iteration = 0; iteration < 18; iteration += 1) {
        position = (lower + upper) / 2;
        if (cubicCoordinate(position, curve.x1, curve.x2) < target) lower = position;
        else upper = position;
    }

    return clamp(cubicCoordinate(position, curve.y1, curve.y2), 0, 1);
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

const getSourceSnapIndexes = (sourcePositions: number[], positions: number[]) => {
    const sourceCount = sourcePositions.length;
    if (sourceCount < 2 || positions.length < sourceCount) return new Map<number, number>();

    const assignments = new Map<number, number>([
        [0, 0],
        [positions.length - 1, sourceCount - 1],
    ]);

    const interiorSourceCount = sourceCount - 2;
    if (interiorSourceCount === 0) return assignments;

    const costs = Array.from({ length: interiorSourceCount }, () => Array(positions.length).fill(Number.POSITIVE_INFINITY));
    const parents = Array.from({ length: interiorSourceCount }, () => Array(positions.length).fill(-1));

    for (let sourceOffset = 0; sourceOffset < interiorSourceCount; sourceOffset += 1) {
        const sourceIndex = sourceOffset + 1;
        const sourcePosition = sourcePositions[sourceIndex];
        const firstStep = sourceIndex;
        const lastStep = positions.length - sourceCount + sourceIndex;

        for (let stepIndex = firstStep; stepIndex <= lastStep; stepIndex += 1) {
            const distance = Math.abs(positions[stepIndex] - sourcePosition);

            if (sourceOffset === 0) {
                costs[sourceOffset][stepIndex] = distance;
                continue;
            }

            for (let previousStep = sourceOffset; previousStep < stepIndex; previousStep += 1) {
                const cost = costs[sourceOffset - 1][previousStep] + distance;
                if (cost < costs[sourceOffset][stepIndex]) {
                    costs[sourceOffset][stepIndex] = cost;
                    parents[sourceOffset][stepIndex] = previousStep;
                }
            }
        }
    }

    const finalOffset = interiorSourceCount - 1;
    let stepIndex = costs[finalOffset].reduce((bestStep, cost, index) => (
        cost < costs[finalOffset][bestStep] ? index : bestStep
    ), 0);

    for (let sourceOffset = finalOffset; sourceOffset >= 0; sourceOffset -= 1) {
        assignments.set(stepIndex, sourceOffset + 1);
        stepIndex = parents[sourceOffset][stepIndex];
    }

    return assignments;
};

export const getSnappedGeneratedIndexes = (
    sourcePositions: number[],
    steps: number,
    easing: CubicBezierCurve,
) => {
    const generatedPositions = Array.from({ length: steps }, (_, index) => (
        applyCubicBezier(index / Math.max(steps - 1, 1), easing)
    ));
    const generatedToSource = getSourceSnapIndexes(sourcePositions, generatedPositions);
    return new Map([...generatedToSource].map(([generatedIndex, sourceIndex]) => [sourceIndex, generatedIndex]));
};

export const createGradientPositionMapper = (
    sourcePositions: number[],
    steps: number,
    easing: CubicBezierCurve,
    snapToSourceColors = false,
) => {
    const sourceCount = sourcePositions.length;
    const getAuthoredPosition = (progress: number) => applyCubicBezier(progress, easing);
    if (!snapToSourceColors || sourceCount <= 2 || steps < sourceCount) return getAuthoredPosition;

    const authoredPositions = Array.from({ length: steps }, (_, index) => (
        getAuthoredPosition(index / Math.max(steps - 1, 1))
    ));
    
    const snapIndexes = getSourceSnapIndexes(sourcePositions, authoredPositions);
    const corrections = [...snapIndexes.entries()]
        .map(([stepIndex, sourceIndex]) => {
            const progress = stepIndex / Math.max(steps - 1, 1);
            const target = sourcePositions[sourceIndex];
            return {
                progress,
                target,
                offset: target - authoredPositions[stepIndex],
            };
        })
        .sort((a, b) => a.progress - b.progress);

    return (progress: number) => {
        const position = clamp(progress, 0, 1);
        const upperIndex = corrections.findIndex((point) => point.progress >= position);
        if (upperIndex <= 0) return clamp(getAuthoredPosition(position) + corrections[0].offset, 0, 1);
        if (corrections[upperIndex].progress === position) return corrections[upperIndex].target;

        const lower = corrections[upperIndex - 1];
        const upper = corrections[upperIndex];
        const width = upper.progress - lower.progress;
        const localPosition = width === 0 ? 0 : (position - lower.progress) / width;
        const smoothPosition = localPosition * localPosition * (3 - (2 * localPosition));
        const offset = lower.offset + ((upper.offset - lower.offset) * smoothPosition);

        return clamp(getAuthoredPosition(position) + offset, 0, 1);
    };
};

const PATH_LENGTH_SAMPLES = 12;

const createColorRanges = (sourceColors: string[], space: InterpolationSpace, hue: HueMethod) => (
    sourceColors.slice(0, -1).map((color, index) => new Color(color).range(
        new Color(sourceColors[index + 1]),
        { space, hue, outputSpace: "srgb" },
    ))
);

const getRangeMetrics = (ranges: Array<(progress: number) => Color>) => (
    ranges.map((range) => {
        let length = 0;
        let previous = range(0);
        const distances = [0];

        for (let sample = 1; sample <= PATH_LENGTH_SAMPLES; sample += 1) {
            const color = range(sample / PATH_LENGTH_SAMPLES);
            length += Color.deltaEOK(previous, color);
            distances.push(length);
            previous = color;
        }

        return { length, distances };
    })
);

const getSourcePositionsForMetrics = (metrics: Array<{ length: number }>) => {
    const totalLength = metrics.reduce((sum, metric) => sum + metric.length, 0);

    if (totalLength <= Number.EPSILON) {
        return Array.from({ length: metrics.length + 1 }, (_, index) => index / Math.max(metrics.length, 1));
    }

    const positions = [0];
    let distance = 0;
    metrics.forEach((metric) => {
        distance += metric.length;
        positions.push(distance / totalLength);
    });
    positions[positions.length - 1] = 1;
    return positions;
};

export const getPaletteSourcePositions = (
    sourceColors: string[],
    space: InterpolationSpace,
    hue: HueMethod,
) => getSourcePositionsForMetrics(getRangeMetrics(createColorRanges(sourceColors, space, hue)));

export const createPalette = (
    sourceColors: string[],
    steps: number,
    space: InterpolationSpace,
    hue: HueMethod,
    easing: CubicBezierCurve = LINEAR_EASING_CURVE,
    snapToSourceColors = false,
) => {
    if (sourceColors.length < 2) return sourceColors.map((color) => new Color(color));
    const ranges = createColorRanges(sourceColors, space, hue);
    const rangeMetrics = getRangeMetrics(ranges);
    const sourcePositions = getSourcePositionsForMetrics(rangeMetrics);
    const getGradientPosition = createGradientPositionMapper(
        sourcePositions,
        steps,
        easing,
        snapToSourceColors,
    );
    const positions = Array.from({ length: steps }, (_, index) => (
        getGradientPosition(index / Math.max(steps - 1, 1))
    ));

    return positions.map((gradientPosition) => {
        const rangeIndex = Math.max(0, Math.min(
            sourcePositions.findIndex((position, index) => index > 0 && gradientPosition <= position) - 1,
            ranges.length - 1,
        ));
        const rangeStart = sourcePositions[rangeIndex];
        const rangeEnd = sourcePositions[rangeIndex + 1];
        const localDistanceProgress = rangeEnd === rangeStart
            ? 0
            : clamp((gradientPosition - rangeStart) / (rangeEnd - rangeStart), 0, 1);
        const metric = rangeMetrics[rangeIndex];
        const targetDistance = localDistanceProgress * metric.length;
        const matchingSample = metric.distances.findIndex((distance) => distance >= targetDistance);
        const upperSample = Math.max(1, matchingSample === -1 ? PATH_LENGTH_SAMPLES : matchingSample);
        const lowerDistance = metric.distances[upperSample - 1];
        const upperDistance = metric.distances[upperSample];
        const sampleProgress = upperDistance === lowerDistance
            ? 0
            : (targetDistance - lowerDistance) / (upperDistance - lowerDistance);
        const localPosition = ((upperSample - 1) + sampleProgress) / PATH_LENGTH_SAMPLES;
        return ranges[rangeIndex](localPosition).toGamut("srgb").to("srgb");
    });
};

export const describeColor = (color: Color | string): ColorDetails => {
    const srgb = (typeof color === "string" ? new Color(color) : color).to("srgb").toGamut("srgb");
    const [red, green, blue] = srgb.coords.map((coordinate) => Math.round(clamp(coordinate ?? 0, 0, 1) * 255));
    const [rawHue, saturation, lightness] = srgb.to("hsl").coords;
    const hue = typeof rawHue === "number" && Number.isFinite(rawHue) ? rawHue : 0;
    return {
        hex: srgb.toString({ format: "hex", collapse: false }).toUpperCase(),
        rgb: `${red}, ${green}, ${blue}`,
        hsl: `${round(hue, 1)}°, ${round(saturation ?? 0, 1)}%, ${round(lightness ?? 0, 1)}%`,
        hue: round(hue, 3),
        saturation: round(saturation ?? 0, 3),
        lightness: round(lightness ?? 0, 3),
    };
};
