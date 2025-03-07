import {
	IInsightFacade,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
	ResultTooLargeError,
} from "../../src/controller/IInsightFacade";
import InsightFacade from "../../src/controller/InsightFacade";
import { clearDisk, getContentFromArchives, loadTestQuery } from "../TestUtil";

import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";

use(chaiAsPromised);

export interface ITestQuery {
	title?: string;
	input: unknown;
	errorExpected: boolean;
	expected: any;
}

describe("InsightFacade", function () {
	let facade: IInsightFacade;

	// Declare datasets used in tests. You should add more datasets like this!
	let sections: string;
	let rooms: string;

	before(async function () {
		// This block runs once and loads the datasets.
		sections = await getContentFromArchives("pair.zip");
		rooms = await getContentFromArchives("campus.zip");
		// Just in case there is anything hanging around from a previous run of the test suite
		await clearDisk();
	});

	describe("AddDataset", function () {
		before(async function () {
			sections = await getContentFromArchives("one_section_valid.zip");
			rooms = await getContentFromArchives("campus.zip");
		});
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should reject with an empty dataset id", async function () {
			// Read the "Free Mutant Walkthrough" in the spec for tips on how to get started

			try {
				await facade.addDataset("", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});

		it("should reject with non base64 string", async function () {
			try {
				await facade.addDataset("ubc", "not base64!", InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});

		it("ok with non empty dataset id", async function () {
			const result = await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const resultRoom = await facade.addDataset("ubcrooms", rooms, InsightDatasetKind.Rooms);
			expect(result).to.have.members(["ubc"]);
			expect(resultRoom).to.have.members(["ubcrooms", "ubc"]);
		});

		it("ok with character+whitespace dataset id", async function () {
			const result = await facade.addDataset("ubc ubc", sections, InsightDatasetKind.Sections);
			expect(result).to.have.members(["ubc ubc"]);
		});

		it("should assert with underlined id", async function () {
			try {
				const result = await facade.addDataset("ubc_school", sections, InsightDatasetKind.Sections);
				expect(result).to.not.have.members(["ubc_school"]);
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});

		it("should assert with white spaced id", async function () {
			try {
				const result = await facade.addDataset("  ", sections, InsightDatasetKind.Sections);
				expect(result).to.not.have.members(["  "]);
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});

		it("should assert with invalid dataset", async function () {
			try {
				sections = await getContentFromArchives("one_section_nocourseid.zip");
				const result = await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				expect(result).to.not.have.members(["ubc"]);
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});

		it("reject with two same ids", async function () {
			try {
				const sections2 = await getContentFromArchives("pair.zip");
				await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				await facade.addDataset("ubc", sections2, InsightDatasetKind.Sections);
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});

		it("adding should be data persistent across different instances of InsightFacade", async function () {
			sections = await getContentFromArchives("pair.zip");
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const facade2 = new InsightFacade();
			const item: InsightResult = {
				id: "ubc",
				kind: InsightDatasetKind.Sections,
				numRows: 64612,
			};
			const datasets = await facade2.listDatasets();
			expect(datasets).lengthOf(1);
			expect(datasets[0]).to.deep.equal(item);
		});

		it("adding zip without courses in sub directory should be rejected", async function () {
			try {
				sections = await getContentFromArchives("no_courses_dir.zip");
				await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});
	});

	describe("ListDatasets", function () {
		before(async function () {
			sections = await getContentFromArchives("one_section_valid.zip");
		});
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should return empty list when no datasets added", async function () {
			const datasets = await facade.listDatasets();
			expect(datasets).lengthOf(0);
		});

		it("should return list of added datasets", async function () {
			sections = await getContentFromArchives("pair.zip");
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const datasets = await facade.listDatasets();
			expect(datasets).lengthOf(1);
			const item: InsightResult = {
				id: "ubc",
				kind: InsightDatasetKind.Sections,
				numRows: 64612,
			};
			expect(datasets[0]).to.deep.equal(item);
		});
	});

	describe("RemoveDataset", function () {
		before(async function () {
			sections = await getContentFromArchives("one_section_valid.zip");
		});
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should remove an added dataset", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const result2 = await facade.removeDataset("ubc");
			const datasets = await facade.listDatasets();
			expect(datasets).lengthOf(0);
			expect(result2).equal("ubc");
		});

		it("should throw error removing non-existent dataset", async function () {
			try {
				await facade.removeDataset("ubc");
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(NotFoundError);
			}
		});
		it("should throw error removing dataset twice", async function () {
			try {
				await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				await facade.removeDataset("ubc");
				await facade.removeDataset("ubc");
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(NotFoundError);
			}
		});
		it("should throw error removing dataset with whitespace id", async function () {
			try {
				await facade.removeDataset("  ");
				expect.fail("Should have thrown error");
			} catch (err) {
				expect(err).to.be.an.instanceOf(InsightError);
			}
		});

		it("removing should be data persistent across different instances of InsightFacade", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const facade2 = new InsightFacade();
			await facade2.removeDataset("ubc");
			const datasets = await facade2.listDatasets();
			expect(datasets).lengthOf(0);
		});
	});

	describe("PerformQuery", function () {
		/**
		 * Loads the TestQuery specified in the test name and asserts the behaviour of performQuery.
		 *
		 * Note: the 'this' parameter is automatically set by Mocha and contains information about the test.
		 */
		async function checkQuery(this: Mocha.Context): Promise<void> {
			if (!this.test) {
				throw new Error(
					"Invalid call to checkQuery." +
						"Usage: 'checkQuery' must be passed as the second parameter of Mocha's it(..) function." +
						"Do not invoke the function directly."
				);
			}
			// Destructuring assignment to reduce property accesses
			const { input, expected, errorExpected } = await loadTestQuery(this.test.title);
			let result: InsightResult[] = []; // dummy value before being reassigned
			try {
				result = await facade.performQuery(input);
			} catch (err) {
				if (!errorExpected) {
					expect.fail(`performQuery threw unexpected error: ${err}`);
				}
				// TODO: replace this failing assertion with your assertions. You will need to reason about the code in this function
				// to determine what to put here :)
				if (expected === "ResultTooLargeError") {
					expect(err).to.be.an.instanceOf(ResultTooLargeError);
				} else if (expected === "InsightError") {
					expect(err).to.be.an.instanceOf(InsightError);
				} else {
					expect.fail(`performQuery threw unexpected error: ${err}`);
				}
				return;
			}
			if (errorExpected) {
				expect.fail(`performQuery resolved when it should have rejected with ${expected}`);
			}
			// TODO: replace this failing assertion with your assertions. You will need to reason about the code in this function
			// to determine what to put here :)
			expect(result).to.deep.members(expected);
		}

		before(async function () {
			facade = new InsightFacade();

			// Add the datasets to InsightFacade once.
			// Will *fail* if there is a problem reading ANY dataset.
			sections = await getContentFromArchives("pair.zip");
			const set2 = await getContentFromArchives("one_section_valid.zip");
			const loadDatasetPromises: Promise<string[]>[] = [
				facade.addDataset("sections", sections, InsightDatasetKind.Sections),
				facade.addDataset("set2", set2, InsightDatasetKind.Sections),
			];

			try {
				await Promise.all(loadDatasetPromises);
			} catch (err) {
				throw new Error(`In PerformQuery Before hook, dataset(s) failed to be added. \n${err}`);
			}
		});

		after(async function () {
			await clearDisk();
		});

		// Examples demonstrating how to test performQuery using the JSON Test Queries.
		// The relative path to the query file must be given in square brackets.
		//valid tests
		it("[valid/simple.json] SELECT dept, avg WHERE avg > 97", checkQuery);
		it("[valid/check_wildcard_front.json] wildcard check start", checkQuery);
		it("[valid/check_wildcard_back.json] wildcard check back", checkQuery);
		it("[valid/check_wildcard_whole.json] wildcard check whole", checkQuery);
		it("[valid/check_not.json] test NOT logic", checkQuery);
		it("[valid/check_or.json] test OR logic", checkQuery);
		it("[valid/check_eq.json] test EQ comparator", checkQuery);
		it("[valid/check_fields.json] test all m and s fields", checkQuery);
		it("[valid/check_not_and_logic.json] test negation and logic", checkQuery);
		it("[valid/empty_return.json] test query with no results", checkQuery);

		it("[valid/test_grouping.json]", checkQuery);

		//invalid tests
		it("[invalid/invalid.json] Query missing WHERE", checkQuery);
		it("[invalid/missing_options.json] Query missing OPTIONS", checkQuery);
		it("[invalid/missing_columns.json] Query OPTIONS missing COLUMNS", checkQuery);
		it("[invalid/too_large.json] Query is too large", checkQuery);
		it("[invalid/invalid_dataset.json] Dataset is invalid", checkQuery);
		it("[invalid/two_dataset_queries.json] Querying two datasets", checkQuery);
		it("[invalid/asterisk_in_middle.json] wildcard in middle", checkQuery);
		it("[invalid/blank_s_field.json] blank s field", checkQuery);
		it("[invalid/blank_m_field.json] blank m field", checkQuery);
		it("[invalid/invalid_m_s_fields.json] invalid m and s fields", checkQuery);
		it("[invalid/empty_columns_array.json] Columns array is empty", checkQuery);
	});
});
