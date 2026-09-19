import PaletteSwatch from "~/components/palette-swatch";
import SectionHeading from "~/components/section-heading";
import { classes } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import PaletteTexturePreview from "../palette-texture-preview";
import { getGeneratedIndexForSource } from "~/lib/colors";

const GeneratedPalette = () => {

    const { colors, stops, selectedPalettePoint } = useGradientGenerator();
    const selection = selectedPalettePoint.value;
    let selectedIndex: number | undefined;

    if (selection?.kind === "generated") {
        selectedIndex = selection.index;
    } else if (selection?.kind === "source") {
        selectedIndex = getGeneratedIndexForSource(
            colors.value,
            stops.value.map(({ color }) => ({ hex: color })),
            selection.index,
        )
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
