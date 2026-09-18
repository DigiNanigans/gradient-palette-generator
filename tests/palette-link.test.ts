import assert from "node:assert/strict";
import test from "node:test";
import { createPaletteChecksum, createPaletteHash, DEFAULT_PALETTE_CONFIGURATION, MAX_PALETTE_SIZE, parsePaletteHash } from "../src/lib/palette-link.ts";
import type { PaletteConfiguration } from "../src/lib/palette-link.ts";

const FIXTURE_CONFIGURATION: PaletteConfiguration = {
    colors: ["#123456", "#ABCDEF", "#00FF88"],
    stepCount: 9,
    space: "lch",
    hue: "longer",
    easing: {
        x1: 0.1,
        y1: 0.2,
        x2: 0.8,
        y2: 0.9,
    },
    snapToSourceColors: true,
};

const FIXTURE_CHECKSUM = "000abcd";
const STABLE_HASH = "#/eyJjbHJzIjpbIjEyMzQ1NiIsIkFCQ0RFRiIsIjAwRkY4OCJdLCJzdGVwIjo5LCJzcGFjIjoibGNoIiwiaHVlbSI6ImxvbmdlciIsImVhc2UiOlswLjEsMC4yLDAuOCwwLjldLCJzbmFwIjoxLCJjaGVrIjoiMDAwYWJjZCJ9";

const validPayload = {
    clrs: ["123456", "ABCDEF"],
    step: 8,
    spac: "oklch",
    huem: "shorter",
    ease: [1 / 3, 1 / 3, 2 / 3, 2 / 3],
    snap: 0,
};

const hashPayload = (payload: unknown) => `#/${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;

test("Pins the emitted format for future compatibility", () => {
    assert.deepEqual(parsePaletteHash(STABLE_HASH), {
        ...FIXTURE_CONFIGURATION,
        checksum: FIXTURE_CHECKSUM,
    });
    assert.equal(createPaletteHash(FIXTURE_CONFIGURATION, FIXTURE_CHECKSUM), STABLE_HASH);
});

test("Ensures checksum of final generated pallet matches", () => {
    const colors = ["#123456", "#ABCDEF", "#00FF88"];
    const checksum = createPaletteChecksum(colors);

    assert.match(checksum, /^[0-9a-z]{7}$/);
    assert.equal(createPaletteChecksum(colors), checksum);
    assert.equal(createPaletteChecksum(colors.map((color) => color.toLowerCase())), checksum);
    assert.notEqual(createPaletteChecksum([...colors].reverse()), checksum);
    assert.notEqual(createPaletteChecksum(["#123456", "#ABCDEF", "#00FF89"]), checksum);
});

test("Round trips a valid checksum and ignores an invalid one", () => {
    assert.equal(
        parsePaletteHash(createPaletteHash(FIXTURE_CONFIGURATION, FIXTURE_CHECKSUM))?.checksum,
        FIXTURE_CHECKSUM,
    );
    assert.equal(parsePaletteHash(hashPayload({ ...validPayload, chek: "invalid!" }))?.checksum, undefined);
});

test("Round trips every supported colour space and hue path", () => {
    const spaces: PaletteConfiguration["space"][] = ["oklch", "lch", "oklab", "lab", "hsl", "hwb", "srgb"];
    const hues: PaletteConfiguration["hue"][] = ["shorter", "longer"];

    for (const space of spaces) {
        for (const hue of hues) {
            const configuration = { ...FIXTURE_CONFIGURATION, space, hue };
            assert.deepEqual(
                parsePaletteHash(createPaletteHash(configuration)),
                configuration,
                `Failed to restore ${space} with the ${hue} hue path`,
            );
        }
    }
});

test("Preserves source order and all output-affecting options", () => {
    const configuration: PaletteConfiguration = {
        colors: ["#010203", "#A0B0C0", "#FF00AA", "#123ABC"],
        stepCount: 32,
        space: "hwb",
        hue: "longer",
        easing: { x1: 0, y1: 1, x2: 1, y2: 0 },
        snapToSourceColors: true,
    };

    assert.deepEqual(parsePaletteHash(createPaletteHash(configuration)), configuration);
});

test("Falls back invalid or missing parameters independently", () => {
    const partialPayload = {
        clrs: ["010203", "AABBCC", "FF00AA"],
        step: "invalid",
        spac: "hsl",
        huem: "clockwise",
        ease: [0.1, "invalid", 0.8],
        snap: 1,
    };

    assert.deepEqual(parsePaletteHash(hashPayload({})), DEFAULT_PALETTE_CONFIGURATION);
    assert.deepEqual(parsePaletteHash(hashPayload(partialPayload)), {
        colors: ["#010203", "#AABBCC", "#FF00AA"],
        stepCount: DEFAULT_PALETTE_CONFIGURATION.stepCount,
        space: "hsl",
        hue: DEFAULT_PALETTE_CONFIGURATION.hue,
        easing: {
            x1: 0.1,
            y1: DEFAULT_PALETTE_CONFIGURATION.easing.y1,
            x2: 0.8,
            y2: DEFAULT_PALETTE_CONFIGURATION.easing.y2,
        },
        snapToSourceColors: true,
    });
});

test("Uses defaults for invalid values while retaining valid siblings", () => {
    const invalidPayload = {
        clrs: Array.from({ length: MAX_PALETTE_SIZE + 1 }, () => "123456"),
        step: MAX_PALETTE_SIZE + 1,
        spac: "rgb",
        huem: "clockwise",
        ease: [-1, 0.25, 2, 0.75],
        snap: true,
    };

    assert.deepEqual(parsePaletteHash(hashPayload(invalidPayload)), {
        ...DEFAULT_PALETTE_CONFIGURATION,
        colors: [...DEFAULT_PALETTE_CONFIGURATION.colors],
        easing: {
            x1: DEFAULT_PALETTE_CONFIGURATION.easing.x1,
            y1: 0.25,
            x2: DEFAULT_PALETTE_CONFIGURATION.easing.x2,
            y2: 0.75,
        },
    });
});
