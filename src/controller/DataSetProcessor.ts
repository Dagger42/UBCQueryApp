import { Section } from "./Sections";
import JSZip from "jszip";
import {InsightDataset, InsightDatasetKind, InsightError} from "./IInsightFacade";
import fs from "fs-extra";
import path from "path";

export default class DataSetProcessor {
	public sections: Section[];
	public totalSections: number;

	constructor() {
		this.sections = [];
		this.totalSections = 0;
	}

	public async checkDataDir() : Promise<void> {
		const dirPath = path.resolve(__dirname, "../../", "data");
		await fs.ensureDir(dirPath);
	}


//content is of type base64 string
//handles the base64 string, separates into individual files -> calls createSectionForFile on each valid file

	public async setSections(content: string): Promise<void> {
		const zip = new JSZip();
		const binaryData = Buffer.from(content, "base64");
		const zippedData = await zip.loadAsync(binaryData);
		const filePaths = Object.keys(zippedData.files);

		if (filePaths.some((filePath) => !filePath.startsWith("courses/"))) {
			throw new InsightError("Must be only a courses subdirectory within zip");
		}

// Process files concurrently
		await Promise.all(
			filePaths.map(async (filePath) => {
				const fileName = filePath.substring("courses/".length);
				if (fileName.length > 1) {
					const fileContent = await zippedData.files[filePath].async("text");
					this.createSectionForFile(fileContent);
				}
			})
		);
	}

// JSONifies file and parses each course section by creating sections to be added to this.sections
	public createSectionForFile(fileContents: string): void {

		const jsonData = JSON.parse(fileContents);
		const requiredFields: string[] = [
			"Course",
			"Title",
			"Avg",
			"id",
			"Professor",
			"Subject",
			"Year",
			"Avg",
			"Pass",
			"Fail",
			"Audit",
		];

		const validSections = jsonData.result.filter((section: any) =>
			requiredFields.every((field) => section[field] !== undefined && section[field] !== null)
		);
		validSections.forEach((section: any) => {
			let sectionYear : number;
			if (section.Section === "Overall") {
				sectionYear = 1900;
			} else {
				sectionYear = section.Year;
			}
			const currSection: Section = {
				uuid: section.id,
				id: section.Course,
				title: section.Title,
				instructor: section.Professor,
				dept: section.Subject,
				year: sectionYear,
				avg: section.Avg,
				pass: section.Pass,
				fail: section.Fail,
				audit: section.Audit,
			};
			this.sections.push(currSection);
			this.totalSections += 1;
		});
	}

	public async writeToFile(id : string) : Promise<void> {
		const currInsightDataset: InsightDataset = {
			id: id,
			kind: InsightDatasetKind.Sections,
			numRows: this.totalSections,
		};
		const jsonData = { sections: this.sections, insightResult : currInsightDataset};
		await fs.writeJson("data/" + id + ".json", jsonData, { spaces: 2 });

	}
}
