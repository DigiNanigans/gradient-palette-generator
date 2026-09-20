import { ColorStop } from "~/types/gradient";
import { classes, st, vars } from "./style.st.css";
import { isHexColor, useGradientGenerator } from "~/hooks/use-gradient-generator";
import { getContrastMode } from "~/lib/colors";
import { useRef } from "preact/hooks";

const ColorStopCard = (props: {
    stop: ColorStop,
    index: number,
    total: number
}) => {

    const {
        updateStop,
        commitStop,
        moveStop,
        removeStop,
        selectedPalettePoint,
        selectPalettePoint,
        beginHistoryTransaction,
        endHistoryTransaction,
    } = useGradientGenerator();
    const textMode = getContrastMode(props.stop.color);
    const selected = selectedPalettePoint.value?.kind === "source" && selectedPalettePoint.value.index === props.index;
    const pickerTransactionActive = useRef(false);

    const beginPickerTransaction = () => {
        if (pickerTransactionActive.current) return;
        pickerTransactionActive.current = true;
        beginHistoryTransaction();
    };

    const endPickerTransaction = () => {
        if (!pickerTransactionActive.current) return;
        pickerTransactionActive.current = false;
        endHistoryTransaction();
    };

    return (
        <article
            class={st(classes.root, { mode: textMode, selected })}
            style={{ [vars.stopColor]: props.stop.color }}
            onClick={() => selectPalettePoint({ kind: "source", index: props.index })}
        >

            <div class={classes.colorWell}>
                <input
                    class={classes.picker}
                    type="color"
                    value={props.stop.color}
                    onFocus={beginPickerTransaction}
                    onInput={(event) => {
                        beginPickerTransaction();
                        updateStop(props.stop.id, event.currentTarget.value);
                    }}
                    onChange={(event) => {
                        updateStop(props.stop.id, event.currentTarget.value);
                        endPickerTransaction();
                    }}
                    onBlur={endPickerTransaction}
                />

                <div class={st(classes.hexField, { invalid: !isHexColor(props.stop.input) })}>
                    <span class={classes.index}>{(props.index + 1).toString().padStart(2, '0')}</span>
                    <input
                        value={props.stop.input}
                        maxlength={7}
                        spellcheck={false}
                        onInput={(event) => updateStop(props.stop.id, event.currentTarget.value)}
                        onBlur={() => commitStop(props.stop.id)}
                    />
                </div>
            </div>

            <div class={classes.actions} onClick={(event) => event.stopPropagation()}>
                <button type="button" disabled={props.index === 0} onClick={() => moveStop(props.index, -1)}>←</button>
                <button type="button" disabled={props.index === props.total - 1} onClick={() => moveStop(props.index, 1)}>→</button>
                <button type="button" disabled={props.total <= 2} onClick={() => removeStop(props.stop.id)}>×</button>
            </div>

        </article>
    );

}

export default ColorStopCard;
