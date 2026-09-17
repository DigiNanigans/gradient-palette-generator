import ColorStopCard from "~/components/color-stop-card";
import SectionHeading from "~/components/section-heading";
import { classes } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";

const SourceColors = () => {

    const { addStop, canAddStop, stops } = useGradientGenerator();
    const sourceColors = stops.value;

    return (

        <section class={classes.root}>

            <SectionHeading title="Source colors" />

            <div class={classes.stopList}>
                {sourceColors.map((stop, index) => (
                    <ColorStopCard key={stop.id} stop={stop} index={index} total={sourceColors.length} />
                ))}

                <button class={classes.addButton} type="button" onClick={addStop} disabled={!canAddStop.value}>
                    <span>Add color</span>
                </button>
            </div>

        </section>

    );

};

export default SourceColors;
