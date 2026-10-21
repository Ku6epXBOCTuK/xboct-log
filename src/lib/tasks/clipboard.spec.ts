import { describe, expect, it } from "vitest";
import { taskText } from "./clipboard";

describe("taskText", () => {
	it("joins the title and the description", () => {
		expect(taskText("Fix checkout", "Steps:\n1. open")).toBe(
			"Fix checkout\n\nSteps:\n1. open",
		);
	});

	it("cuts the empty description", () => {
		expect(taskText("Fix checkout", "")).toBe("Fix checkout");
		expect(taskText("Fix checkout", "   \n ")).toBe("Fix checkout");
	});
});
