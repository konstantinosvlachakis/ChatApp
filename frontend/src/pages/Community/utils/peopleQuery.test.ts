import {
  DEFAULT_PANEL_FILTERS,
  DEFAULT_QUICK_FILTERS,
  activePanelFilterCount,
  countParams,
  exchangeRule,
  othersParams,
  perfectParams,
  previewTotal,
  toggleLanguage,
} from "./peopleQuery";

test("perfect params share filters but never include or sort", () => {
  const filters = {
    ...DEFAULT_PANEL_FILTERS,
    theySpeak: ["russian"],
    level: "advanced_plus" as const,
    sort: "newest" as const,
    include: { native: true, learners: false, rest: true },
  };
  const quick = { ...DEFAULT_QUICK_FILTERS, near: true, myLevel: true };
  expect(perfectParams(filters, quick, 2, 24)).toEqual({ page: 2, page_size: 24, section: "perfect", they_speak: "russian", level: "advanced_plus", near: 1, my_level: 1 });
  expect(othersParams(filters, quick, 1, 24)).toMatchObject({ section: "others", include: "native,rest", sort: "newest", near: 1 });
  expect(countParams(filters, quick)).toMatchObject({ counts: 1, page_size: 1 });
  expect(othersParams(DEFAULT_PANEL_FILTERS, DEFAULT_QUICK_FILTERS, 1, 24)).toEqual({ page: 1, page_size: 24, section: "others" });
});

test("language chips: all on is null and the last one can't be removed", () => {
  const options = ["greek", "english"];
  expect(toggleLanguage(null, "greek", options)).toEqual(["english"]);
  expect(toggleLanguage(["english"], "english", options)).toEqual(["english"]);
  expect(toggleLanguage(["english"], "greek", options)).toBeNull();
});

test("badge count, preview total and the rule line", () => {
  expect(activePanelFilterCount(DEFAULT_PANEL_FILTERS)).toBe(0);
  expect(activePanelFilterCount({ ...DEFAULT_PANEL_FILTERS, theyLearn: ["greek"], sort: "active" })).toBe(2);
  expect(previewTotal({ perfect: 2, others: 5 }, DEFAULT_PANEL_FILTERS)).toBe(7);
  expect(previewTotal({ perfect: 2, others: 5 }, { ...DEFAULT_PANEL_FILTERS, include: { native: false, learners: false, rest: false } })).toBe(2);
  expect(previewTotal(undefined, DEFAULT_PANEL_FILTERS)).toBeNull();
  expect(exchangeRule(["russian"], ["greek", "english"])).toBe("They speak Russian and are learning Greek or English.");
});
