import { describe, expect, test } from "bun:test";
import { coverHeight, coverHeightPx, sidePanelWidth, sidePanelWidthPx, topBarHeight, topBarHeightPx } from "./constants";

describe("layout constants", () => {
    test("expose the pixel dimensions", () => {
        expect(sidePanelWidth).toBe(420);
        expect(topBarHeight).toBe(60);
        expect(coverHeight).toBe(400);
    });

    test("expose matching CSS pixel strings", () => {
        expect(sidePanelWidthPx).toBe("420px");
        expect(topBarHeightPx).toBe("60px");
        expect(coverHeightPx).toBe("400px");
    });

    test("keep each px string in sync with its numeric value", () => {
        expect(sidePanelWidthPx).toBe(`${sidePanelWidth}px`);
        expect(topBarHeightPx).toBe(`${topBarHeight}px`);
        expect(coverHeightPx).toBe(`${coverHeight}px`);
    });
});
