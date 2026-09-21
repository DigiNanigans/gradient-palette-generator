import { getContrastMode, type ColorDetails } from "~/lib/colors";
import { classes, st, vars } from "./style.st.css";
import { useToast } from "~/hooks/use-toast";
import type { TargetedMouseEvent } from "preact";

const PaletteSwatch = (props: {
    color: ColorDetails;
    sourceIndex?: number;
    selected?: boolean;
    hovered?: boolean;
    addMode?: boolean;
    removeMode?: boolean;
    insertionBefore?: boolean;
    insertionAfter?: boolean;
    elementRef?: (element: HTMLButtonElement | null) => void;
    onHoverChange?: (hovered: boolean) => void;
    onModifiedClick?: (event: TargetedMouseEvent<HTMLButtonElement>) => void;
    onDoubleClick?: (event: TargetedMouseEvent<HTMLButtonElement>) => void;
}) => {

    const { notify } = useToast();
    const indexMode = getContrastMode(props.color.hex);

    const copyColor = async () => {
        try {
            await navigator.clipboard.writeText(props.color.hex);
            notify(`${props.color.hex} copied`, { tone: "success" });
        } catch {
            notify("Clipboard unavailable", { tone: "error" });
        }
    };

    const handleClick = (event: TargetedMouseEvent<HTMLButtonElement>) => {
        props.onModifiedClick?.(event);
        if (!event.defaultPrevented) void copyColor();
    };

    return (
        <button
            class={st(classes.root, {
                selected: props.selected,
                hovered: props.hovered,
                addMode: props.addMode,
                removeMode: props.removeMode,
                insertionBefore: props.insertionBefore,
                insertionAfter: props.insertionAfter,
                mode: indexMode,
            })}
            ref={props.elementRef}
            type="button"
            onClick={handleClick}
            onDblClick={props.onDoubleClick}
            onPointerEnter={() => props.onHoverChange?.(true)}
            onPointerLeave={() => props.onHoverChange?.(false)}
            title={`Copy ${props.color.hex}`}
            style={{ [vars.swatchColor]: props.color.hex }}
        >

            <span class={classes.color}>
                {props.sourceIndex !== undefined && (
                    <span class={classes.index}>{(props.sourceIndex + 1).toString().padStart(2, '0')}</span>
                )}
                <span class={classes.hex}>{props.color.hex}</span>
            </span>
            
        </button>
    );

}

export default PaletteSwatch;
