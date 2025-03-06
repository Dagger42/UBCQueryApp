import { Section, Rooms } from "./Sections";
import JSZip from "jszip";
import { InsightDataset, InsightDatasetKind, InsightError } from "./IInsightFacade";
import fs from "fs-extra";
import * as parse5 from "parse5";

interface GeoResponse {
	lat?: number;
	lon?: number;
	error?: string;
}

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
		await fs.writeJson("data/" + id + "_" + kind + ".json", jsonData, { spaces: 2 });
	}

	//functioned called for parsing HTML and setting rooms Data Structure
	public async setRooms(content: string): Promise<void> {
		const zip = new JSZip();
		const binaryData = Buffer.from(content, "base64");
		const zippedData = await zip.loadAsync(binaryData);
		const filePaths = Object.keys(zippedData.files);
		if (!filePaths.includes("index.htm")) {
			throw new InsightError("Must contain index.htm");
		}

		if (
			filePaths.some(
				(filePath) => !filePath.startsWith("campus/discover/buildings-and-classrooms/") || filePath !== "index.htm"
			)
		) {
			throw new InsightError("Does not follow correct zip structure of rooms dataset");
		}
		const indexHtmlFile = zippedData.files["index.htm"];
		const indexHtmlContent = await indexHtmlFile.async("text");
		const parsedIndexHtml = parse5.parse(indexHtmlContent);
		//fetch the set of tables
		//then find the valid table
		//after finding valid table fetch all
		const validTable = this.findValidTable(parsedIndexHtml);
		if (validTable === undefined) {
			throw new InsightError("No valid index.html table found.");
		}
		// handle API call remove all buildings that cannot retrieve address
		const setOfBuildingFiles = this.fetchBuildingFiles(validTable);
		const updatedBuildingFilesSet = Array.from(setOfBuildingFiles).map(async (buildingInfo) => {
			const geoData = await this.fetchGeolocation(buildingInfo.address);
			if (geoData === null) {
				return null;
			}
			if (geoData.error) {
				return null;
			}
			buildingInfo.lat = geoData.lat;
			buildingInfo.lon = geoData.lon;
			return buildingInfo;
		});
		const setOfBuildingFilesUpdate1 = await Promise.all(updatedBuildingFilesSet);
		const setOfBuildingFilesUpdate2 = new Set(setOfBuildingFilesUpdate1.filter((building) => building !== null));
		// need to now loop through the map and then check whether the link is valid, pop all that are invalid
		for (const buildingInfo of setOfBuildingFilesUpdate2) {
			if (filePaths.some((filePath) => filePath.startsWith(buildingInfo.href.substring(2)))) {
				const buildingFileHtml = zippedData.files[buildingInfo.href.substring(2)];
				const buildingFileHtmlContent = await buildingFileHtml.async("text");
				const parsedBuildingFileHtml = parse5.parse(buildingFileHtmlContent);
				// need to validate and find table
				if (this.findValidTable(parsedBuildingFileHtml)) {
					this.fetchRooms(this.findValidTable(parsedBuildingFileHtml), buildingInfo);
				}
			}
		}
	}

	public fetchRooms(table: any, buildingInfo: any) {
		for (const child of table.childNodes) {
			if (child.nodeName === "tbody") {
				for (const row of child.childNodes) {
					if (row.nodeName === "tr") {
						const currRoom: Rooms = {
							fullname: buildingInfo.fullname,
							shortname: buildingInfo.shortname,
							address: buildingInfo.address,
							lat: buildingInfo.lat,
							lon: buildingInfo.lon,
						};
						for (const cell of row.childNodes) {
							if (cell.nodeName === "td" && cell.attrs?.length > 0 && cell.attrs[0].name === "class") {
								const cellAttr = cell.attrs[0].value;
								if (cellAttr === "views-field views-field-field-room-capacity") {
									const textNode = cell.childNodes[0];
									if (textNode) {
										currRoom.seats = Number(textNode.value);
									}
								} else if (cellAttr === "views-field views-field-field-room-furniture") {
									const textNode = cell.childNodes[0];
									if (textNode) {
										currRoom.furniture = textNode.value.trim();
									}
								} else if (cellAttr === "views-field views-field-field-room-type") {
									const textNode = cell.childNodes[0];
									if (textNode) {
										currRoom.type = textNode.value.trim();
									}
								} else if (cellAttr === "views-field views-field-field-room-number") {
									const linkNode = cell.childNodes[0];
									if (linkNode && linkNode.nodeName === "a") {
										currRoom.href = linkNode.attrs[0].value;
									}
									const textNode = linkNode.childNodes[0];
									if (textNode) {
										currRoom.number = textNode.value.trim();
									}
								}
							}
						}
						if (currRoom.number && currRoom.href && currRoom.type && currRoom.furniture && currRoom.seats) {
							currRoom.name = currRoom.shortname + "_" + currRoom.number;
						}
						this.totalRooms++;
						this.rooms.push(currRoom);
					}
				}
			}
		}
	}

	// finds the validTable in the html file
	public findValidTable(node: any): any | null {
		if (node.nodeName === "table") {
			if (this.tableContainsValidtd(node)) {
				return node;
			}
		}
		if (node.childNodes.length !== 0) {
			for (const child of node.childNodes) {
				const result = this.findValidTable(child);
				if (result) {
					return result;
				}
			}
		}
		return null;
	}

	//check if a given table has a valid td within its struct
	public tableContainsValidtd(node: any): boolean {
		if (!node) {
			return false;
		}
		if (node.childNodes.length === 0) {
			return false;
		}
		for (const child of node.childNodes) {
			if (child.nodeName === "td") {
				if (this.hasRequiredClass(child)) {
					return true;
				}
			}
			if (this.tableContainsValidtd(child)) {
				return true;
			}
		}
		return false;
	}

	// check if a td has the required class attributes
	public hasRequiredClass(node: any): boolean {
		if (!node.attrs) {
			return false;
		}
		for (const attr of node.attrs) {
			if (attr.name === "class") {
				const classValue = attr.value;
				if (
					classValue.includes("views-field") ||
					classValue.includes("views-field-title") ||
					classValue.includes("views-field-field-building-address")
				) {
					return true;
				}
			}
		}
		return false;
	}

	private fetchBuildingFiles(table: any): Set<any> {
		const buildingFiles = new Set<any>(); //building shortname : building information]
		for (const child of table.childNodes) {
			if (child.nodeName === "tbody") {
				for (const row of child.childNodes) {
					if (row.nodeName === "tr") {
						const buildingInfo = {
							fullname: "",
							shortname: "",
							address: "",
							href: "",
							lat: 0,
							lon: 0,
						};
						for (const cell of row.childNodes) {
							if (cell.nodeName === "td" && cell.attrs?.length > 0 && cell.attrs[0].name === "class") {
								const classAttr = cell.attrs[0].value;
								if (classAttr === "views-field views-field-title") {
									// Find the <a> tag inside the <td> and extract text
									const link = cell.childNodes[0];
									if (link && link.attrs?.length > 0) {
										buildingInfo.href = link.attrs[0].value;
									}
									const textNode = link.childNodes[0];
									buildingInfo.fullname = textNode.value;
								} else if (classAttr === "views-field views-field-field-building-address") {
									const textNode = cell.childNodes[0];
									if (textNode) {
										buildingInfo.address = textNode.value.trim();
									}
								} else if (classAttr === "views-field views-field-field-building-code") {
									const textNode = cell.childNodes[0];
									if (textNode) {
										buildingInfo.shortname = textNode.value.trim();
									}
								}
							}
						}

						// If both title and address are found, store them in the Set
						if (buildingInfo.fullname && buildingInfo.shortname && buildingInfo.address && buildingInfo.href) {
							buildingFiles.add(buildingInfo);
						}
					}
				}
			}
		}
		return buildingFiles;
	}
	public async fetchGeolocation(address: string): Promise<GeoResponse | null> {
		const encodedAddress = encodeURIComponent(address);
		const url = "http://cs310.students.cs.ubc.ca:11316/api/v1/project_team272/" + encodedAddress;
		const response = await fetch(url);
		if (!response.ok) {
			return null;
		}
		const data: GeoResponse = await response.json();
		return data as GeoResponse;
	}
}
