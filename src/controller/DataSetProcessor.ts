import {Section} from "./Sections";
import JSZip from "jszip";
import {InsightError} from "./IInsightFacade";

export default class DataSetProcessor {
	public sections : any[];
	public totalSections : number;

	constructor() {
		this.sections = [];
		this.totalSections = 0;

	}

	//content is of type base64 string
	//handles the base64 string, separates into individual files -> calls createSectionForFile on each valid file
	public async setSections(content : string) {
		const zip = new JSZip();
		const binaryData = Buffer.from(content, "base64");
		const zippedData = await zip.loadAsync(binaryData);
		const filePaths = Object.keys(zippedData.files)
		for (const filePath of filePaths) {
			if(!filePath.startsWith("courses/")) {
				throw new InsightError("Must be only a courses subdirectory within zip")
			}
			const fileName = filePath.substring("courses/".length);
			if (fileName.length > 1) {
				this.createSectionForFile(await zippedData.files[filePath].async("text"));
			}
		}
	}

	// JSONifies file and parses each course section by creating sections to be added to this.sections
	public createSectionForFile(fileContents: string) {
		const jsonData = JSON.parse(fileContents);
		const requiredFields: string[] = ["Course", "Title", "Avg", "id",
			"Professor", "Subject", "Year", "Avg", "Pass", "Fail", "Audit"];

		const validSections = jsonData.result.filter((section: any) =>
			requiredFields.every((field) => section[field] !== undefined && section[field] !== null)
		);
		validSections.forEach((section: any) => {
			const currSection: Section = {
				uuid: section.id,
				id: section.Course,
				title: section.Title,
				instructor: section.Professor,
				dept: section.Subject,
				year: section.Year,
				avg: section.Avg,
				pass: section.Pass,
				fail: section.Fail,
				audit: section.Audit
			};
			this.sections.push(currSection);
			this.totalSections += 1;
		});
	}
}
