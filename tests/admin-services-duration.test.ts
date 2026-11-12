import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { aboutDuration } from "@/lib/catalog/admin-duration";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

// R3: the duration column of the admin services list says how long a service takes in words, as an
// estimate ("Sekitar 2 jam"), built from the whole minutes a service stores (T7).

const idDuration = createTranslator({ locale: "id", messages: id, namespace: "AdminServicesPage.duration" });
const enDuration = createTranslator({ locale: "en", messages: en, namespace: "AdminServicesPage.duration" });

describe("aboutDuration", () => {
  it("names whole hours, hours with minutes, and minutes alone in Indonesian", () => {
    expect(aboutDuration(120, idDuration)).toBe("Sekitar 2 jam");
    expect(aboutDuration(90, idDuration)).toBe("Sekitar 1 jam 30 menit");
    expect(aboutDuration(45, idDuration)).toBe("Sekitar 45 menit");
  });

  it("uses singular and plural words in English", () => {
    expect(aboutDuration(60, enDuration)).toBe("About 1 hour");
    expect(aboutDuration(120, enDuration)).toBe("About 2 hours");
    expect(aboutDuration(90, enDuration)).toBe("About 1 hour 30 minutes");
    expect(aboutDuration(61, enDuration)).toBe("About 1 hour 1 minute");
    expect(aboutDuration(45, enDuration)).toBe("About 45 minutes");
  });

  it("rounds odd input to whole minutes and never goes below zero", () => {
    expect(aboutDuration(89.6, idDuration)).toBe("Sekitar 1 jam 30 menit");
    expect(aboutDuration(-5, idDuration)).toBe("Sekitar 0 menit");
  });
});
