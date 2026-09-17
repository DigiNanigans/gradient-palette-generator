import type { HueMethod, InterpolationSpace } from "~/lib/colors";
import { classes, st, vars } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import SectionHeading from "../section-heading";
import { useComputed } from "@preact/signals";

const SPACE_OPTIONS: Array<{ value: InterpolationSpace; label: string }> = [
    { value: "oklch", label: "OKLCH" },
    { value: "lch", label: "LCH" },
    { value: "oklab", label: "OKLAB" },
    { value: "lab", label: "LAB" },
    { value: "hsl", label: "HSL" },
    { value: "hwb", label: "HWB" },
    { value: "srgb", label: "sRGB" },
];

const BlendSettings = () => {

    const { stepCount, minStepCount, maxStepCount, space, hue, setStepCount, setSpace, setHue } = useGradientGenerator();
    const rangeProgress = useComputed(() => maxStepCount === minStepCount.value ? 100 : ((stepCount.value - minStepCount.value) / (maxStepCount - minStepCount.value)) * 100);

    return (
        <section class={classes.root}>

            <SectionHeading title="Blend settings" />

            <div class={classes.card}>

                <label class={st(classes.control)}>
                    <span class={classes.label}>Steps <strong>{stepCount.value}</strong></span>
                    <input
                        class={classes.range}
                        type="range"
                        min={minStepCount.value}
                        max={maxStepCount}
                        value={stepCount.value}
                        disabled={minStepCount.value === maxStepCount}
                        style={{[vars.rangeProgress]: `${rangeProgress.value}%` }}
                        onInput={(event) => setStepCount(event.currentTarget.valueAsNumber)}
                    />
                    <span class={classes.rangeBounds}><span>{minStepCount.value}</span><span>{maxStepCount}</span></span>
                </label>

                <label class={classes.control}>
                    <span class={classes.label}>Color space</span>
                    <select value={space.value} onChange={(event) => setSpace(event.currentTarget.value as InterpolationSpace)}>
                        {SPACE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                    </select>
                </label>

                <label class={classes.control}>
                    <span class={classes.label}>Hue path</span>
                    <select value={hue.value} onChange={(event) => setHue(event.currentTarget.value as HueMethod)}>
                        <option value="shorter">Shorter</option>
                        <option value="longer">Longer</option>
                    </select>
                </label>

            </div>

        </section>
    )
}

export default BlendSettings;
