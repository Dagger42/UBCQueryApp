import Decimal from "decimal.js";
import { InsightResult } from "./IInsightFacade";

export interface Group {
	keySet: Record<string, any>;
	entries: any[];
}

export class QueryGroup {
	private dataset: string = "";
	private anyKeyToOperation: Record<string, string> = {};
	private keyToAnyKey: Record<string, string[]> = {};
	private groups: any[] = [];
	private groupKeys: string[] = [];
	private anyKeyToQueryKey: Record<string, string> = {};

	public initialize(dataset: string, transformations: any, keyValidatorFunc: Function): boolean {
		this.dataset = dataset;
		if (typeof transformations !== "object") {
			return false;
		}

		const keys = Object.keys(transformations);
		if (keys.length !== 2) {
			return false;
		}

		if (!("GROUP" in transformations) || !("APPLY" in transformations)) {
			return false;
		}

		const groupList = transformations.GROUP;
		const applyRuleList = transformations.APPLY;

		if (!Array.isArray(groupList) || groupList.length === 0) {
			return false;
		}

		for (const key of groupList) {
			const { isValid, datasetId } = keyValidatorFunc(key);
			if (!isValid || datasetId !== dataset) {
				return false;
			}

			this.groupKeys.push(key);
		}

		if (!Array.isArray(applyRuleList)) {
			return false;
		}

		for (const rule of applyRuleList) {
			if (!this.validateApplyRule(rule, keyValidatorFunc)) {
				return false;
			}
		}

		return true;
	}

	private validateApplyRule(rule: any, keyValidatorFunc: Function): boolean {
		if (!this.checkValidObj(rule)) {
			return false;
		}

		const anyKey = Object.keys(rule)[0];
		const applyTokenObj = rule[anyKey];
		if (anyKey.indexOf("_") !== -1 || anyKey.length < 1 || anyKey in this.anyKeyToOperation) {
			return false;
		}

		if (!this.checkValidObj(applyTokenObj)) {
			return false;
		}

		const applyTokenKey = Object.keys(applyTokenObj)[0];
		const targetKey = applyTokenObj[applyTokenKey];
		switch (applyTokenKey) {
			case "MAX":
			case "MIN":
			case "SUM":
			case "AVG":
				// TODO : Make sure to add keyType to keyValidatorFunc
				const { queryKey, isValid, keyType, datasetId } = keyValidatorFunc(targetKey);
				if (!isValid || keyType !== "n" || datasetId !== this.dataset) {
					return false;
				}

				this.anyKeyToOperation[anyKey] = applyTokenKey;
				this.anyKeyToQueryKey[anyKey] = queryKey;
				if (this.keyToAnyKey[queryKey] === undefined) {
					this.keyToAnyKey[queryKey] = [];
				}

				this.keyToAnyKey[queryKey].push(anyKey);
				break;
			case "COUNT":
				// TODO : implement this
				const struct = keyValidatorFunc(targetKey);
				if (!struct.isValid || struct.datasetId !== this.dataset) {
					return false;
				}

				this.anyKeyToOperation[anyKey] = applyTokenKey;
				this.anyKeyToQueryKey[anyKey] = struct.queryKey;
				if (this.keyToAnyKey[struct.queryKey] === undefined) {
					this.keyToAnyKey[struct.queryKey] = [];
				}

				this.keyToAnyKey[struct.queryKey].push(anyKey);

				break;
			default:
				return false;
		}

		return true;
	}

	public addEntry(entry: any): void {
		let matchingGroup = null;
		for (const group of this.groups) {
			let allEqual = true;
			for (const groupKey in group.keySet) {
				const queryKey = groupKey.slice(groupKey.indexOf("_"));
				if (group.keySet[groupKey] !== entry[queryKey]) {
					allEqual = false;
					break;
				}
			}

			if (allEqual) {
				matchingGroup = group;
				break;
			}
		}

		if (!matchingGroup) {
			matchingGroup = this.makeGroup(entry);
		}

		for (const queryKey in this.keyToAnyKey) {
			this.updateGroup(matchingGroup, entry, this.keyToAnyKey[queryKey]);
		}
	}

	private makeGroup(entry: any): any {
		const newGroup: any = { keySet: {} };
		this.groupKeys.forEach((key) => {
			const queryKey = key.slice(key.indexOf("_"));
			newGroup.keySet[key] = entry[queryKey];
		});

		for (const applyKey in this.anyKeyToOperation) {
			const queryKey = this.anyKeyToQueryKey[applyKey];
			if (this.groupKeys.includes(queryKey)) {
				const actual = queryKey.slice(queryKey.indexOf("_"));
				const op = this.anyKeyToOperation[applyKey];
				if (op === "COUNT") {
					newGroup[applyKey] = 1;
				} else {
					newGroup[applyKey] = entry[actual];
				}

				continue;
			}

			if (this.anyKeyToOperation[applyKey] === "AVG") {
				newGroup[applyKey] = new Decimal(0);
			} else if (this.anyKeyToOperation[applyKey] === "COUNT") {
				newGroup[applyKey] = new Set<String>();
			} else {
				newGroup[applyKey] = 0;
			}
		}

		newGroup.numRows = 0;
		this.groups.push(newGroup);
		return newGroup;
	}

	private updateGroup(group: any, entry: any, keyToAnyKeyElement: string[]): void {
		group.numRows++;
		keyToAnyKeyElement.forEach((anyKey) => {
			const operation = this.anyKeyToOperation[anyKey];
			const queryKey = this.anyKeyToQueryKey[anyKey];
			if (this.groupKeys.includes(this.anyKeyToQueryKey[this.dataset + "_" + queryKey])) {
				return;
			}

			switch (operation) {
				case "MAX":
					group[anyKey] = Math.max(group[anyKey], entry[queryKey]);
					break;
				case "MIN":
					group[anyKey] = Math.min(group[anyKey], entry[queryKey]);
					break;
				case "AVG":
					group[anyKey].add(entry[queryKey]);
					break;
				case "SUM":
					group[anyKey] += entry[queryKey];
					break;
				case "COUNT":
					if (!group[anyKey].has(entry[queryKey])) {
						group[anyKey].add(entry[queryKey]);
					}
			}
		});
	}

	public getAllSelectableKeys(): string[] {
		const groupKeys = [...this.groupKeys];
		groupKeys.push(...Object.keys(this.keyToAnyKey));

		return groupKeys;
	}

	public getGroupKeys(): string[] {
		return this.groupKeys;
	}

	private checkValidObj(obj: any): boolean {
		if (typeof obj !== "object") {
			return false;
		}

		if (Object.keys(obj).length !== 1) {
			return false;
		}

		return false;
	}

	public getResults(columns: string[], insightResults: InsightResult[]): void {
		for (const group of this.groups) {
			columns.forEach((key) => {
				const result: InsightResult = {};
				if (this.anyKeyToOperation[key] === "AVG") {
					if (this.groupKeys.includes(this.anyKeyToQueryKey[key])) {
						result[key] = Number(group[key]);
					} else {
						const avg = group[key].toNumber() / group.numRows;
						result[key] = Number(avg.toFixed(2));
					}
				} else if (this.anyKeyToOperation[key] === "SUM") {
					result[key] = group[key].toFixed(2);
				} else {
					result[key] = group[key];
				}

				insightResults.push(result);
			});
		}
	}
}
