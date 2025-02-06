import { InsightError, InsightResult, ResultTooLargeError } from "./IInsightFacade";
import fs from "fs-extra";

export interface Filter {
	[key: string]: string | number | Filter[] | Filter;
}

export interface Options {
	COLUMNS: string[];
	ORDER?: string;
}

export interface Query {
	WHERE: Filter;
	OPTIONS: Options;
}

export class QueryProcessor {
	private validKeys: Record<string, string> = {
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
	private seenDatasets: string[] = [];
	private sections: string[] = [];

	public async performQuery(input: any, sections: string[]): Promise<InsightResult[]> {
		this.seenDatasets = [];
		this.sections = sections;
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
			const temp: any = section;
			if (this.applyFilters(section, input.WHERE)) {
				const result: InsightResult = {};
				columns.forEach((key: string) => {
					result[key] = temp[this.isValidKey(key).queryKey];
				});

				insightResults.push(result);
			}
		}

		const queryMaxResults = 5000;
		if (insightResults.length > queryMaxResults) {
			throw new ResultTooLargeError();
		}

		if (order) {
			this.sortResultsByProperty(insightResults, order);
		}

		return insightResults;
	}

	public sortResultsByProperty(results: any[], property: string): void {
		results.sort((a, b) => {
			const p1 = a[property];
			const p2 = b[property];

			if (typeof p1 === "string") {
				return p1.localeCompare(p2);
			}

			return p1 - p2;
		});
	}

	private validateQuery(input: Query): boolean {
		if (typeof input !== "object") {
			return false;
		}

		const queryMaxKeys = 2;
		if (Object.keys(input).length > queryMaxKeys) {
			return false;
		}

		if (!("WHERE" in input) || !("OPTIONS" in input)) {
			return false;
		}

		const where = input.WHERE;
		if (typeof where === "object" && Object.keys(where).length === 0) {
			return this.validateOptions(input.OPTIONS);
		}

		if (!this.validateFilters(where)) {
			return false;
		}

		return this.validateOptions(input.OPTIONS);
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

	public validateOptions(options: Options): boolean {
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

		for (const key of columns) {
			if (!this.isValidKey(key).isValid) {
				return false;
			}
		}

		return !(order && columns.indexOf(order) === -1);
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
				if (typeof keyVal !== "number" || this.validKeys[checkedKey.queryKey] !== "n") {
					return false;
				}
				break;
			case "IS":
				if (typeof keyVal !== "string" || this.validKeys[checkedKey.queryKey] !== "s") {
					return false;
				}
				break;
		}

		return true;
	}

	public isValidKey(key: string): any {
		const dashIdx = key.indexOf("_");
		const datasetId = key.substring(0, dashIdx);
		const queryKey = key.substring(dashIdx + 1);

		let isValid = true;
		const sections = this.sections;
		if (!sections) {
			return { queryKey: queryKey, datasetId: datasetId, isValid: isValid };
		}

		if (sections.indexOf(datasetId) >= 0 && this.seenDatasets.indexOf(datasetId) === -1) {
			this.seenDatasets.push(datasetId);
			if (this.seenDatasets.length > 1) {
				isValid = false;
			}
		}

		if (!(queryKey in this.validKeys) || dashIdx === -1 || !(sections.indexOf(datasetId) >= 0)) {
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
		const sectionVal: number = obj[key];

		const { queryKey } = this.isValidKey(key);
		switch (compStr) {
			case "GT":
				return section[queryKey] > sectionVal;
			case "LT":
				return section[queryKey] < sectionVal;
			case "EQ":
				return section[queryKey] === sectionVal;
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
			return sectionVal.includes(keyVal.substring(1, keyVal.length - 1));
		} else if (wcLeft === "*") {
			return sectionVal.endsWith(keyVal.substring(1));
		} else if (wcRight === "*") {
			return sectionVal.startsWith(keyVal.substring(0, keyVal.length - 1));
		}

		return sectionVal === keyVal;
	}
}
