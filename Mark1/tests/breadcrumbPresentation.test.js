import assert from "node:assert/strict";
import test from "node:test";

import { resolveBreadcrumbIcon } from "../src/utils/breadcrumbPresentation.js";

test("prefers explicit breadcrumb icon metadata", () => {
    assert.equal(resolveBreadcrumbIcon({
        title: "Anything",
        data: { kind: "REVIEW_STATUS", icon: "PAUSE" },
    }), "PAUSE");
});

test("maps current breadcrumb kinds to their action family", () => {
    assert.equal(resolveBreadcrumbIcon({
        title: "Scouting expressions",
        data: { kind: "EXPRESSION_ASSIST_LOADING" },
    }), "CHECK");
});

test("keeps the scene progress ring as the only scene-leading icon", () => {
    assert.equal(resolveBreadcrumbIcon({
        title: "Scene 1 / 3: Opening",
        data: { kind: "REVIEW_SCENE" },
    }), null);
});

test("supports persisted breadcrumbs created before icon metadata", () => {
    assert.equal(resolveBreadcrumbIcon({ title: "Trying to remember something from past" }), "MEMORY");
    assert.equal(resolveBreadcrumbIcon({ title: "Sync failed (will retry next time)" }), "ERROR");
});
