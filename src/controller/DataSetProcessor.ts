import { Section, Rooms } from "./Sections";
import JSZip from "jszip";
import { InsightDataset, InsightDatasetKind, InsightError } from "./IInsightFacade";
import fs from "fs-extra";
import * as parse5 from "parse5";
import { findValidTable, getAttribute, findChildTag, fetchGeolocation } from "./HTMLTreeTraversalMethods";

export default class DataSetProcessor {
	public sections: Section[];
	public totalSections: number;
	public rooms: Rooms[];
	public totalRooms: number;

	constructor() {
		this.sections = [];
		this.totalSections = 0;
		this.rooms = [];
		this.totalRooms = 0;
	}

	//content is of type base64 string
	//handles the base64 string, separates into individual files -> calls createSectionForFile on each valid file

	public async setSections(content: string): Promise<void> {
		const zip = new JSZip();
		const binaryData = Buffer.from(content, "base64");
		const zippedData = await zip.loadAsync(binaryData);
		const filePaths = Object.keys(zippedData.files);

		if (!filePaths.some((filePath) => filePath.startsWith("courses/"))) {
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

		if (this.sections.length === 0) {
			throw new InsightError("No valid sections");
		}
	}

	// JSONifies file and parses each course section by creating sections to be added to this.sections
	public createSectionForFile(fileContents: string): void {
		let jsonData;
		try {
			jsonData = JSON.parse(fileContents);
		} catch (_err) {
			return;
		}
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
		if (!("result" in jsonData)) {
			return;
		}
		if (!Array.isArray(jsonData.result)) {
			return;
		}
		const validSections = jsonData.result.filter((section: any) =>
			requiredFields.every((field) => section[field] !== undefined && section[field] !== null)
		);
		validSections.forEach((section: any) => {
			this.createOneSection(section);
		});
	}

	private createOneSection(section: any): void {
		let sectionYear: number;
		const year: number = 1900;
		if (section.Section === "overall") {
			sectionYear = year;
		} else {
			sectionYear = Number(section.Year);
		}
		const currSection: Section = {
			uuid: String(section.id),
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
	}

	public async writeToFile(id: string, kind: InsightDatasetKind): Promise<void> {
		const currInsightDataset: InsightDataset = {
			id: id,
			kind: kind,
			numRows: kind === "rooms" ? this.totalRooms : this.totalSections,
		};

		const jsonData = { sections: kind === "rooms" ? this.rooms : this.sections, insightResult: currInsightDataset };
		await fs.writeJson("data/" + id + ".json", jsonData, { spaces: 2 });
	}

	public validateFilePathsRooms(filePaths: string[]): boolean {
		if (!filePaths.includes("index.htm")) {
			return false;
		}
		const invalidFiles = filePaths.filter(
			(filePath) =>
				!filePath.endsWith("/") &&
				filePath !== "index.htm" &&
				!filePath.startsWith("campus/discover/buildings-and-classrooms/")
		);
		return invalidFiles.length > 0;
	}

	//function called for parsing HTML and setting rooms Data Structure
	public async setRooms(content: string): Promise<void> {
		const zip = new JSZip();
		const binaryData = Buffer.from(content, "base64");
		const zippedData = await zip.loadAsync(binaryData);
		const filePaths = Object.keys(zippedData.files);
		if (this.validateFilePathsRooms(filePaths)) {
			throw new InsightError("INVALID ZIP FILE");
		}
		const indexHtmlFile = zippedData.files["index.htm"];
		const indexHtmlContent = await indexHtmlFile.async("text");
		const parsedIndexHtml = parse5.parse(indexHtmlContent);
		const validTable = findValidTable(parsedIndexHtml);
		if (validTable === undefined) {
			throw new InsightError("No valid index.html table found.");
		}
		// handle API call remove all buildings that cannot retrieve address
		const setOfBuildingFilesUpdate1 = await this.fetchBuildingsWithGeolocation(validTable);
		const validBuildings = Array.from(setOfBuildingFilesUpdate1).filter((building) => building !== null);
		const buildingPromises = validBuildings.map(async (buildingInfo) => {
			if (filePaths.some((filePath) => filePath.startsWith(buildingInfo.href.substring(2)))) {
				const buildingFileHtml = zippedData.files[buildingInfo.href.substring(2)];
				const buildingFileHtmlContent = await buildingFileHtml.async("text");
				const parsedBuildingFileHtml = parse5.parse(buildingFileHtmlContent);

				// Find and validate the table
				const validTableRooms = findValidTable(parsedBuildingFileHtml);
				if (validTableRooms) {
					return this.fetchRooms(validTableRooms, buildingInfo);
				}
			}
			return null; // Return null for invalid buildings
		});
		await Promise.all(buildingPromises);
	}

	private async fetchBuildingsWithGeolocation(validTable: any): Promise<any[]> {
		const setOfBuildingFiles = this.fetchBuildingFiles(validTable);
		const updatedBuildingFilesSet = Array.from(setOfBuildingFiles).map(async (buildingInfo) => {
			const geoData = await fetchGeolocation(buildingInfo.address);
			if (!geoData || geoData.error) {
				return null;
			}
			buildingInfo.lat = geoData.lat;
			buildingInfo.lon = geoData.lon;
			return buildingInfo;
		});

		return await Promise.all(updatedBuildingFilesSet);
	}

	public fetchRooms(table: any, buildingInfo: any): void {
		for (const child of table.childNodes) {
			if (child.nodeName === "tbody") {
				for (const row of child.childNodes) {
					if (row.nodeName === "tr") {
						const currRoom = this.processRoomRow(row, buildingInfo);
						if (currRoom) {
							this.totalRooms++;
							this.rooms.push(currRoom);
						}
					}
				}
			}
		}
	}

	private processRoomRow(row: any, buildingInfo: any): Rooms | null {
		const currRoom: Rooms = {
			fullname: buildingInfo.fullname,
			shortname: buildingInfo.shortname,
			address: buildingInfo.address,
			lat: buildingInfo.lat,
			lon: buildingInfo.lon,
		};

		for (const cell of row.childNodes) {
			if (cell.nodeName === "td" && cell.attrs?.length > 0 && getAttribute(cell, "class")) {
				const cellAttr = getAttribute(cell, "class");
				if (cellAttr === "views-field views-field-field-room-capacity") {
					const textNode = findChildTag(cell, "#text");
					currRoom.seats = Number(textNode.value);
				} else if (cellAttr === "views-field views-field-field-room-furniture") {
					const textNode = findChildTag(cell, "#text");
					currRoom.furniture = textNode.value.trim();
				} else if (cellAttr === "views-field views-field-field-room-type") {
					const textNode = findChildTag(cell, "#text");
					currRoom.type = textNode.value.trim();
				} else if (cellAttr === "views-field views-field-field-room-number") {
					const linkNode = findChildTag(cell, "a");
					currRoom.href = getAttribute(linkNode, "href");
					const textNode = findChildTag(linkNode, "#text");
					currRoom.number = textNode.value.trim();
				}
			}
		}

		currRoom.name = `${currRoom.shortname}_${currRoom.number}`;
		return currRoom;
	}

	private fetchBuildingFiles(table: any): Set<any> {
		const buildingFiles = new Set<any>();

		for (const child of table.childNodes) {
			if (child.nodeName === "tbody") {
				for (const row of child.childNodes) {
					if (row.nodeName === "tr") {
						const buildingInfo = this.processBuildingRow(row);
						if (buildingInfo) {
							buildingFiles.add(buildingInfo);
						}
					}
				}
			}
		}
		return buildingFiles;
	}

	private processBuildingRow(row: any): any | null {
		const buildingInfo = {
			fullname: "",
			shortname: "",
			address: "",
			href: "",
			lat: 0,
			lon: 0,
		};
		for (const cell of row.childNodes) {
			if (cell.nodeName === "td" && cell.attrs?.length > 0) {
				this.processBuildingCell(cell, buildingInfo);
			}
		}
		return buildingInfo.fullname && buildingInfo.shortname && buildingInfo.address && buildingInfo.href
			? buildingInfo
			: null;
	}

	private processBuildingCell(cell: any, buildingInfo: any): void {
		const classAttr = getAttribute(cell, "class");
		if (!classAttr) return;

		if (classAttr === "views-field views-field-title") {
			const link = findChildTag(cell, "a");
			if (link && link.attrs?.length > 0) {
				buildingInfo.href = getAttribute(link, "href");
			}
			const textNode = findChildTag(link, "#text");
			if (textNode) {
				buildingInfo.fullname = textNode.value;
			}
		} else if (classAttr === "views-field views-field-field-building-address") {
			const textNode = findChildTag(cell, "#text");
			if (textNode) {
				buildingInfo.address = textNode.value.trim();
			}
		} else if (classAttr === "views-field views-field-field-building-code") {
			const textNode = findChildTag(cell, "#text");
			if (textNode) {
				buildingInfo.shortname = textNode.value.trim();
			}
		}
	}
}
