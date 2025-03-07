import fs from "fs-extra";

export interface Filter {
	[key: string]: string | number | Filter[] | Filter;
}

export interface Options {
	COLUMNS: string[];
	ORDER?: string;
}

export interface Query {
	TRANSFORMATIONS?: any;
	WHERE: Filter;
	OPTIONS: Options;
}

export function sortResultsByProperty(results: any[], property: string): void {
	results.sort((a, b) => {
		const p1 = a[property];
		const p2 = b[property];

		if (typeof p1 === "string") {
			if (p1 === p2) {
				return 0;
			}

			return p1 < p2 ? -1 : 1;
		}

		return p1 - p2;
	});
}

export function sortResultsWithTies(results: any[], keys: string[], dir: string): void {
	results.sort((a: any, b: any) => {
		for (const k of keys) {
			const p1: any = a[k];
			const p2: any = b[k];

			if (p1 < p2) {
				return dir === "UP" ? -1 : 1; // Ascending for 'UP', Descending otherwise
			} else if (p1 > p2) {
				return dir === "UP" ? 1 : -1;
			}
		}
		return 0; // If all keys are equal, maintain order
	});
}

export function validateSort(order: any, columns: string[]): boolean {
	if (typeof order === "string") {
		if (!columns.includes(order)) {
			return false;
		}
	}

	if (typeof order === "object") {
		if (Object.keys(order).length !== 2) {
			return false;
		}

		if (!("dir" in order) || !("keys" in order)) {
			return false;
		}

		const dir = order.dir;
		const sortKeys = order.keys;

		if (!(dir === "UP" || dir === "DOWN")) {
			return false;
		}

		if (Array.isArray(sortKeys)) {
			return sortKeys.every((key) => {
				return columns.includes(key);
			});
		} else {
			return false;
		}
	}

	return true;
}

export async function getDatasetsWithTypes(ids: string[], target: any): Promise<void> {
	const promises = [];
	for (const id of ids) {
		promises.push(fs.readJson("./data/" + id + ".json"));
	}

	const jsons = await Promise.all(promises);
	for (const json of jsons) {
		target[json.insightResult.id] = json.insightResult.kind;
	}
}

export function validateTopLevel(input: any): boolean {
	const requiredKeys = ["WHERE", "OPTIONS"];
	const optionalKey = "TRANSFORMATIONS";
	if (!("WHERE" in input) || !("OPTIONS" in input)) {
		return false;
	}

	const allowedKeys = new Set([...requiredKeys, optionalKey]);
	for (const key of Object.keys(input)) {
		if (!allowedKeys.has(key)) {
			return false;
		}
	}

	return true;
}

export function validateColumns(
	selectableKeys: string[] | undefined,
	validator: Function,
	columns: string[],
	hasTransforms: boolean
): boolean {
	//const selectableKeys = this.queryGroup?.getAllSelectableKeys();
	for (const key of columns) {
		if (hasTransforms) {
			if (selectableKeys?.indexOf(key) === -1) {
				return false;
			}
		} else {
			if (!validator(key).isValid) {
				return false;
			}
		}
	}

	return true;
}
