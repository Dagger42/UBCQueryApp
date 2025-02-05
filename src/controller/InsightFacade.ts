import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError
} from "./IInsightFacade";
import DataSetProcessor from "./DataSetProcessor";
import {QueryProcessor} from "./QueryProcessor";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	private readonly datasets: Map<string, DataSetProcessor>; // Map of dataset ID to its parsed sections
	private insightDatasets: Map<string, InsightDataset>;
	private queryProcessor: QueryProcessor;

	constructor() {
		this.datasets = new Map();
		this.insightDatasets = new Map();
		this.queryProcessor = new QueryProcessor();
	}

	private idIsInvalid(id: string) : boolean {
		return id.length === 0 || id.trim() === "" || id.includes("_");
	}

	private getIdList(): string[] {
		const result : string[] =[];
		for (const id of this.datasets.keys()) {
			result.push(id);
		}
		return result;
	}

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		if (this.idIsInvalid(id)) {
			throw new InsightError("Dataset ID is invalid");
		}
		if (this.datasets.has(id)) {
			throw new InsightError("There is already a dataset with this id");
		}
		const currDataset: DataSetProcessor = new DataSetProcessor();
		await currDataset.setSections(content);
		this.datasets.set(id, currDataset);

		const currInsightDataset: InsightDataset = {
			id: id,
			kind: InsightDatasetKind.Sections,
			numRows: currDataset.totalSections
		};
		this.insightDatasets.set(id, currInsightDataset);

		if (currDataset.sections.length === 0) {
			throw new InsightError("No valid sections found");
		}
		return this.getIdList();
	}

	public async removeDataset(id: string): Promise<string> {
		if (this.idIsInvalid(id)) {
			throw new InsightError("Dataset ID is invalid");
		}
		if (!this.datasets.has(id)) {
			throw new NotFoundError("There is no dataset with this ID");
		}

		this.datasets.delete(id);
		this.insightDatasets.delete(id);

		return id;
	}


	public async performQuery(query: unknown): Promise<InsightResult[]> {
		// TODO: Remove this once you implement the methods!
		return this.queryProcessor.performQuery(query, this.datasets);
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		// TODO: Remove this once you implement the methods!
		return new Promise((resolve, reject) => {
			const returnList : InsightDataset[] = [];
			for (const key of this.insightDatasets.keys()) {
				returnList.push(<InsightDataset>this.insightDatasets.get(key));
			}
			resolve(returnList);
		})
	}
}
