// finds the validTable in the html file
import * as parse5 from "parse5";
import http from "http";

export interface GeoResponse {
	lat?: number;
	lon?: number;
	error?: string;
}

export function findValidTable(node: any): any | null {
	if (node.nodeName === "table") {
		if (tableContainsValidtd(node)) {
			return node;
		}
	}
	if (node.childNodes?.length) {
		for (const child of node.childNodes) {
			const result = findValidTable(child);
			if (result) {
				return result;
			}
		}
	}
	return null;
}

//check if a given table has a valid td within its struct
export function tableContainsValidtd(node: any): boolean {
	if (!node?.childNodes) return false;

	for (const child of node.childNodes) {
		if (child.nodeName === "td" && hasRequiredClass(child)) {
			return true;
		} else if (tableContainsValidtd(child)) {
			return true;
		}
	}

	return false;
}

// check if a td has the required class attributes
export function hasRequiredClass(node: any): boolean {
	if (!node.attrs) {
		return false;
	}
	for (const attr of node.attrs) {
		if (attr.name === "class") {
			const classValue = attr.value;
			if (classValue.includes("views-field")) {
				return true;
			}
		}
	}
	return false;
}

export function getAttribute(node: parse5.DefaultTreeAdapterMap["element"], attrName: string): string {
	if (!Array.isArray(node.attrs)) return "";
	return node.attrs.find((attr) => attr.name === attrName)?.value || "";
}

export function findChildTag(parent: parse5.DefaultTreeAdapterMap["element"], tagName: string): any | undefined {
	return parent.childNodes.find((node) => node.nodeName === tagName);
}

export async function fetchGeolocation(address: string): Promise<GeoResponse> {
	return new Promise((resolve, reject) => {
		const encodedAddress = encodeURIComponent(address);
		const url = `http://cs310.students.cs.ubc.ca:11316/api/v1/project_team272/${encodedAddress}`;

		http
			.get(url, (res) => {
				let data = "";
				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					try {
						const parsedData = JSON.parse(data) as GeoResponse;
						resolve(parsedData);
					} catch (_error) {
						reject(new Error("Failed to parse response JSON"));
					}
				});
			})
			.on("error", (error) => {
				reject(new Error(`HTTP Request Failed: ${error.message}`));
			});
	});
}
