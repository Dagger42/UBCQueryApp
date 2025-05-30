import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
} from "./IInsightFacade";
import DataSetProcessor from "./DataSetProcessor";
import { QueryProcessor } from "./QueryProcessor";
import fs from "fs-extra";
import path from "path";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	//private readonly datasets: Map<string, DataSetProcessor>; // Map of dataset ID to its parsed sections
	//private insightDatasets: Map<string, InsightDataset>;

	private queryProcessor: QueryProcessor;

	constructor() {
		//this.datasets = new Map();
		//this.insightDatasets = new Map();
		this.queryProcessor = new QueryProcessor();
	}

	private idIsInvalid(id: string): boolean {
		return id.length === 0 || id.trim() === "" || id.includes("_");
	}

	// Loops through data dir files and fetch each file name
	private async getIdList(): Promise<string[]> {
		const dataDir = path.resolve(__dirname, "../../data");
		const files = await fs.readdir(dataDir);
		return files.map((file) => path.parse(file).name);
	}

	// Creates the data directory if not already there
	public async createDataDir(): Promise<void> {
		const dirPath = path.resolve(__dirname, "../../", "data");
		await fs.ensureDir(dirPath);
	}

	// Checks if there exists a dataset on disk with given id
	private async localHas(id: string): Promise<boolean> {
		const filePath = path.resolve(__dirname, "../../data");
		const files = await fs.readdir(filePath);
		return files.includes(id + ".json");
	}

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		if (this.idIsInvalid(id)) {
			throw new InsightError("Dataset ID is invalid");
		}
		await this.createDataDir();

		if (await this.localHas(id)) {
			throw new InsightError("There is already a dataset with this id");
		}

		const currDataset: DataSetProcessor = new DataSetProcessor();

		try {
			if (kind === InsightDatasetKind.Sections) {
				await currDataset.setSections(content);
			} else if (kind === InsightDatasetKind.Rooms) {
				await currDataset.setRooms(content);
			}
		} catch (_error) {
			throw new InsightError("content was not readable");
		}

		await currDataset.writeToFile(id, kind);

		if (currDataset.sections.length === 0 && currDataset.rooms.length === 0) {
			throw new InsightError("No valid sections found");
		}
		return this.getIdList();
	}

	public async removeDataset(id: string): Promise<string> {
		if (this.idIsInvalid(id)) {
			throw new InsightError("Dataset ID is invalid");
		}
		// check if this is a valid dataset id (check disk folder)
		if (!(await this.localHas(id))) {
			throw new NotFoundError("There is no dataset with this ID");
		}

		const filePath = path.resolve(__dirname, "../../data", id + ".json");
		await fs.remove(filePath);

		return id;
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		const datasetIds = await this.getIdList();
		return this.queryProcessor.performQuery(query, datasetIds);
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		await this.createDataDir();
		const dataDir = path.resolve(__dirname, "../../data");
		const files = await fs.readdir(dataDir);

		return await Promise.all(
			files.map(async (file) => {
				const filePath = path.join(dataDir, file);
				const jsonData = await fs.readJson(filePath);
				return jsonData.insightResult as InsightDataset;
			})
		);
	}
}
