import { describe, expect, it } from "vitest";
import { categoryTranslation, translate, translateWarning } from "./i18n";

describe("translate", () => {
  it("defaults to Spanish copy", () => {
    expect(translate("es", "nav.connect")).toBe("Conectar");
    expect(translate("es", "theme.light")).toBe("Claro");
  });

  it("serves English copy", () => {
    expect(translate("en", "nav.connect")).toBe("Connect");
    expect(translate("en", "theme.light")).toBe("Light");
  });

  it("interpolates values", () => {
    expect(translate("es", "common.filesCount", { count: 12 })).toBe("12 archivos");
    expect(translate("en", "report.ofCandidates", { count: "7" })).toBe("of 7 candidates");
  });
});

describe("categoryTranslation", () => {
  it("translates known categories and keeps fallbacks", () => {
    expect(categoryTranslation("es", "WA_MEDIA", "label", "WhatsApp media")).toBe(
      "Multimedia de WhatsApp",
    );
    expect(categoryTranslation("es", "UNKNOWN", "label", "Fallback")).toBe("Fallback");
  });
});

describe("translateWarning", () => {
  it("translates known backend warnings", () => {
    expect(
      translateWarning(
        "es",
        "WhatsApp media will disappear from chats. Databases and documents are kept.",
      ),
    ).toContain("desaparecerá");
  });

  it("leaves English warnings alone", () => {
    const warning = "Duplicate cleanup keeps one copy of each hash group.";
    expect(translateWarning("en", warning)).toBe(warning);
  });
});
