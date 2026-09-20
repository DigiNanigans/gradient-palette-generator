import PaletteSwatch from "~/components/palette-swatch";
import SectionHeading from "~/components/section-heading";
import { classes } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import PaletteTexturePreview from "../palette-texture-preview";
import { getPaletteSourcePositions, getSnappedGeneratedIndexes } from "~/lib/colors";

const GeneratedPalette = () => {

    const { colors, stops, stepCount, space, hue, easing, snapToSourceColors, selectedPalettePoint } = useGradientGenerator();
    const selection = selectedPalettePoint.value;
    let selectedIndex: number | undefined;

    if (selection?.kind === "generated") {
        selectedIndex = selection.index;
    } else if (selection?.kind === "source") {
        if (selection.index === 0) selectedIndex = 0;
        else if (selection.index === stops.value.length - 1) selectedIndex = colors.value.length - 1;
        else if (snapToSourceColors.value) {
            const sourcePositions = getPaletteSourcePositions(
                stops.value.map(({ color }) => color),
                space.value,
                hue.value,
            );

            selectedIndex = getSnappedGeneratedIndexes(sourcePositions, stepCount.value, easing.value).get(selection.index);
        }
    }

    return (
        <section class={classes.root}>

            <SectionHeading title="Generated palette" />

            <PaletteTexturePreview colors={colors.value} />

            <div class={classes.swatchGrid}>
                {colors.value.map((color, index) => (
                    <PaletteSwatch color={color} selected={index === selectedIndex} key={`${color.hex}-${index}`} />
                ))}
            </div>

        </section>
    );
};

export default GeneratedPalette;
