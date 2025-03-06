import { InsightError, InsightResult, ResultTooLargeError } from "./IInsightFacade";
import fs from "fs-extra";
import { QueryGroup } from "./QueryGroup";

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

export class QueryProcessor {
	private validKeysSections: Record<string, string> = {
		uuid: "s",
		id: "s",
		title: "s",
		instructor: "s",
		dept: "s",
		year: "n",
		avg: "n",
		pass: "n",
		fail: "n",
		audit: "n",
	};

	private validKeysRooms: Record<string, string> = {
		fullname: "s",
		shortname: "s",
		number: "s",
		name: "s",
		address: "s",
		lat: "n",
		lon: "n",
		seats: "n",
		type: "s",
		furniture: "s",
		href: "s",
	};

	private seenDatasets: string[] = [];
	private sections: any = {};
	private queryGroup: QueryGroup | null = null;

	public async performQuery(input: any, sections: string[]): Promise<InsightResult[]> {
		this.seenDatasets = [];
		//this.sections = sections;
		await this.getDatasetsWithTypes(sections);
		this.queryGroup = new QueryGroup();

		if (!this.validateQuery(input)) {
			throw new InsightError();
		}

		const queryingDataset = this.seenDatasets[0];
		this.seenDatasets = [];
		const columns = input.OPTIONS.COLUMNS;
		const order = input.OPTIONS.ORDER;

		const insightResults: InsightResult[] = [];

		const jsonData = await fs.readJson("./data/" + queryingDataset + ".json");
		for (const section of jsonData.sections) {
			const temp = section;
			if (this.applyFilters(section, input.WHERE)) {
				if ("TRANSFORMATIONS" in input) {
					this.queryGroup.addEntry(section);
				} else {
					const result: InsightResult = {};
					columns.forEach((key: string) => {
						result[key] = temp[this.isValidKey(key).queryKey];
					});

					insightResults.push(result);
				}
			}
		}

		if ("TRANSFORMATIONS" in input) {
			this.queryGroup.getResults(columns, insightResults);
		}

		const queryMaxResults = 5000;
		if (insightResults.length > queryMaxResults) {
			throw new ResultTooLargeError();
		}

		if (typeof order === "string") {
			this.sortResultsByProperty(insightResults, order);
		} else {
			this.sortResultsWithTies(insightResults, order.keys, order.dir);
		}

		return insightResults;
	}

	public sortResultsByProperty(results: any[], property: string): void {
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

	public sortResultsWithTies(results: any[], keys: string[], dir: string): void {
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

	private async getDatasetsWithTypes(ids: string[]): Promise<void> {
		const promises = [];
		for (const id of ids) {
			promises.push(fs.readJson("./data/" + id + ".json"));
		}

		const jsons = await Promise.all(promises);
		for (const json of jsons) {
			this.sections[json.insightResult.id] = json.insightResult.kind;
		}
	}

	private validateQuery(input: Query): boolean {
		if (typeof input !== "object") {
			return false;
		}

		const requiredKeys = ["BODY", "OPTIONS"];
		const optionalKey = "TRANSFORMATIONS";
		for (const key of requiredKeys) {
			if (!(key in input)) {
				return false;
			}
		}

		// Check if it contains only allowed keys
		const allowedKeys = new Set([...requiredKeys, optionalKey]);
		for (const key of Object.keys(input)) {
			if (!allowedKeys.has(key)) {
				return false;
			}
		}

		const where = input.WHERE;
		if (typeof where !== "object") {
			return false;
		}

		if (Object.keys(where).length > 0 && !this.validateFilters(where)) {
			return false;
		}

		let hasTransforms = false;
		if ("TRANSFORMATIONS" in input) {
			hasTransforms = true;
			const trans = input.TRANSFORMATIONS;
			if (!this.queryGroup?.initialize(this.seenDatasets[0], trans, this.isValidKey)) {
				return false;
			}
		}

		return this.validateOptions(input.OPTIONS, hasTransforms);
	}

	private validateFilters(input: any, parentFilter = ""): boolean {
		if (typeof input !== "object") {
			return false;
		}

		const keys: string[] = Object.keys(input);
		if (keys.length === 0 || keys.length > 1) {
			return false;
		}

		const currKey = keys[0];
		const keyVal = input[currKey];
		if (parentFilter) {
			return this.validateQueryPair(currKey, keyVal, parentFilter);
		}

		switch (currKey) {
			case "AND":
			case "OR":
				return this.validateListFilter(keyVal);
			case "NOT":
				return this.validateFilters(keyVal);
			case "GT":
			case "LT":
			case "EQ":
			case "IS":
				return this.validateFilters(keyVal, currKey);
			default:
				break;
		}

		return false;
	}

	public validateOptions(options: Options, hasTransforms: boolean): boolean {
		if (typeof options !== "object") {
			return false;
		}

		const optionsKeys = Object.keys(options);
		const queryMaxKeys = 2;
		if (optionsKeys.length > queryMaxKeys) {
			return false;
		}

		if (!("COLUMNS" in options)) {
			return false;
		}

		for (const key of optionsKeys) {
			if (!(key === "ORDER" || key === "COLUMNS")) {
				return false;
			}
		}

		const columns = options.COLUMNS;
		const order = options.ORDER;
		if (!Array.isArray(columns) || columns.length === 0) {
			return false;
		}

		const selectableKeys = this.queryGroup?.getAllSelectableKeys();
		for (const key of columns) {
			if (hasTransforms && selectableKeys?.indexOf(key) === -1) {
				return false;
			}

			if (!this.isValidKey(key).isValid) {
				return false;
			}
		}

		if (order) {
			return this.validateSort(order, columns);
		}

		return true;
	}

	public validateSort(order: any, columns: string[]): boolean {
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
			}
		}

		return false;
	}

	public validateListFilter(keyVal: any): boolean {
		if (!Array.isArray(keyVal)) {
			return false;
		}

		if (keyVal.length === 0) {
			return false;
		}

		for (const sub of keyVal) {
			if (!this.validateFilters(sub)) {
				return false;
			}
		}

		return true;
	}

	public validateQueryPair(currKey: string, keyVal: any, filterStr: string): boolean {
		const checkedKey = this.isValidKey(currKey);
		if (!checkedKey.isValid) {
			return false;
		}

		if (typeof keyVal === "string") {
			for (let i = 0; i < keyVal.length; i++) {
				if (keyVal[i] === "*" && i > 0 && i < keyVal.length - 1) {
					return false;
				}
			}
		}

		switch (filterStr) {
			case "GT":
			case "LT":
			case "EQ":
				if (typeof keyVal !== "number" || this.validKeysSections[checkedKey.queryKey] !== "n") {
					return false;
				}
				break;
			case "IS":
				if (typeof keyVal !== "string" || this.validKeysSections[checkedKey.queryKey] !== "s") {
					return false;
				}
				break;
		}

		return true;
	}

	public isValidKey(key: string): any {
		const dashIdx = key.indexOf("_");
		const datasetId = key.slice(0, dashIdx);
		const queryKey = key.slice(dashIdx + 1);

		let isValid = true;
		const sections = this.sections;
		if (!sections) {
			return { queryKey: queryKey, datasetId: datasetId, isValid: isValid };
		}

		if (datasetId in this.sections && this.seenDatasets.indexOf(datasetId) === -1) {
			this.seenDatasets.push(datasetId);
			if (this.seenDatasets.length > 1) {
				isValid = false;
			}
		}

		let looking = {};
		if (this.sections[datasetId] === "sections") {
			looking = this.validKeysSections;
		} else {
			looking = this.validKeysRooms;
		}

		if (!(queryKey in looking) || dashIdx === -1 || !(datasetId in this.sections)) {
			isValid = false;
		}

		return { queryKey: queryKey, datasetId: datasetId, isValid: isValid };
	}

	private applyFilters(section: any, query: any): boolean {
		const filterStr = Object.keys(query)[0];
		const keyVal = query[filterStr];

		switch (filterStr) {
			case "AND":
				for (const q of keyVal) {
					if (!this.applyFilters(section, q)) {
						return false;
					}
				}
				return true;
			case "OR":
				let atLeastOne = false;
				for (const q of keyVal) {
					if (this.applyFilters(section, q)) {
						atLeastOne = true;
						break;
					}
				}

				return atLeastOne;
			case "NOT":
				return !this.applyFilters(section, keyVal);
			case "GT":
			case "LT":
			case "EQ":
				return this.checkQueryKeyNumeric(section, keyVal, filterStr);
			case "IS":
				return this.checkQueryKeyString(section, keyVal);
			default:
				break;
		}

		return true;
	}

	public checkQueryKeyNumeric(section: any, obj: any, compStr: string): boolean {
		const key = Object.keys(obj)[0];
		const keyVal: number = obj[key];

		const { queryKey } = this.isValidKey(key);
		const sectionVal: number = section[queryKey];
		switch (compStr) {
			case "GT":
				return sectionVal > keyVal;
			case "LT":
				return sectionVal < keyVal;
			case "EQ":
				return sectionVal === keyVal;
		}

		return true;
	}

	public checkQueryKeyString(section: any, obj: any): boolean {
		const key = Object.keys(obj)[0];
		const keyVal: string = obj[key];

		const { queryKey } = this.isValidKey(key);
		const sectionVal: string = section[queryKey];

		const wcLeft = keyVal[0];
		const wcRight = keyVal[keyVal.length - 1];
		if (wcLeft === "*" && wcRight === "*") {
			return sectionVal.includes(keyVal.slice(1, keyVal.length - 1));
		} else if (wcLeft === "*") {
			return sectionVal.endsWith(keyVal.slice(1));
		} else if (wcRight === "*") {
			return sectionVal.startsWith(keyVal.slice(0, keyVal.length - 1));
		}

		return sectionVal === keyVal;
	}
}
