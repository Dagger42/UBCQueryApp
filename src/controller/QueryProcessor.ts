import { InsightError, InsightResult, ResultTooLargeError } from "./IInsightFacade";
import {
	sortResultsByProperty,
	sortResultsWithTies,
	validateSort,
	getDatasetsWithTypes,
	validateTopLevel,
} from "./Helpers";
import { Query, Options, validateColumns } from "./Helpers";
import fs from "fs-extra";
import { QueryGroup } from "./QueryGroup";

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
		await getDatasetsWithTypes(sections, this.sections);
		this.queryGroup = new QueryGroup();

		if (!this.validateQuery(input)) {
			throw new InsightError();
		}

		const queryingDataset = this.seenDatasets[0];
		this.seenDatasets = [];
		const { COLUMNS, ORDER } = input.OPTIONS;

		const insightResults: InsightResult[] = [];
		const allEntries = [];

		const jsonData = await fs.readJson("./data/" + queryingDataset + ".json");
		for (const section of jsonData.sections) {
			const temp = section;
			if (this.applyFilters(section, input.WHERE)) {
				if ("TRANSFORMATIONS" in input) {
					allEntries.push(section);
				} else {
					const result: InsightResult = {};
					COLUMNS.forEach((key: string) => {
						result[key] = temp[this.isValidKey(key).queryKey];
					});

					insightResults.push(result);
				}
			}
		}

		this.constructGroups(input, allEntries, COLUMNS, insightResults);
		const queryMaxResults = 5000;
		if (insightResults.length > queryMaxResults) {
			throw new ResultTooLargeError();
		}

		this.sortResultsByOrderKey(ORDER, insightResults);
		return insightResults;
	}

	public constructGroups(input: any, allEntries: any[], columns: any, insightResults: InsightResult[]): void {
		if ("TRANSFORMATIONS" in input) {
			for (const e of allEntries) {
				this.queryGroup?.addEntry(e);
			}

			this.queryGroup?.getResults(columns, insightResults);
		}
	}

	public sortResultsByOrderKey(order: any, insightResults: any[]): void {
		if (typeof order === "string") {
			sortResultsByProperty(insightResults, order);
		} else if (typeof order === "object") {
			sortResultsWithTies(insightResults, order.keys, order.dir);
		}
	}

	private validateQuery(input: Query): boolean {
		if (typeof input !== "object") {
			return false;
		}

		if (!validateTopLevel(input)) {
			return false;
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

		if (!validateColumns(this.queryGroup?.getAllSelectableKeys(), this.isValidKey, columns, hasTransforms)) {
			return false;
		}

		if (order) {
			return validateSort(order, columns);
		}

		return true;
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
		const { keyType, isValid } = this.isValidKey(currKey);
		if (!isValid) {
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
				if (typeof keyVal !== "number" || keyType !== "n") {
					return false;
				}
				break;
			case "IS":
				if (typeof keyVal !== "string" || keyType !== "s") {
					return false;
				}
				break;
		}

		return true;
	}

	public isValidKey = (key: string): any => {
		const dashIdx = key.indexOf("_");
		const datasetId = key.slice(0, dashIdx);
		const queryKey = key.slice(dashIdx + 1);

		let isValid = true;

		if (datasetId in this.sections && this.seenDatasets.indexOf(datasetId) === -1) {
			this.seenDatasets.push(datasetId);
			if (this.seenDatasets.length > 1) {
				isValid = false;
			}
		}

		if (dashIdx === -1 || !(datasetId in this.sections)) {
			isValid = false;
		}

		let looking: any;
		if (this.sections[datasetId] === "sections") {
			looking = this.validKeysSections;
		} else {
			looking = this.validKeysRooms;
		}

		if (!(queryKey in looking)) {
			return false;
		}

		return { queryKey: queryKey, datasetId: datasetId, isValid: isValid, keyType: looking[queryKey] };
	};

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
