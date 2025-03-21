import { expect } from "chai";
import request from "supertest";
import { StatusCodes } from "http-status-codes";
import { Log } from "@ubccpsc310/project-support";
import Server from "../../src/rest/Server";
import * as fs from "fs-extra";
import { InsightDatasetKind } from "../../src/controller/IInsightFacade";

describe("Facade C3", function () {
	let server: Server;

	before(async function () {
		// TODO: start server here once and handle errors properly
		const PORT = 4321;
		server = new Server(PORT);
		try {
			await server.start();
		} catch (err) {
			throw new Error(`${err}`);
		}
	});

	after(async function () {
		// TODO: stop server here once!
		await server.stop();
	});

	beforeEach(function () {
		// might want to add some process logging here to keep track of what is going on
	});

	afterEach(function () {
		// might want to add some process logging here to keep track of what is going on
	});

	it("GET echo test", async function () {
		try {
			const res = await request("http://localhost:4321")
				.get("/echo/hello")
				.send("")
				.set("Content-Type", "application/json");
			expect(res.status).equal(StatusCodes.OK);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	// Sample on how to format PUT requests
	it("PUT test for courses dataset", async function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/sections";
		const ZIP_FILE_DATA = await fs.readFile("test/resources/archives/pair.zip");

		try {
			const res = await request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send(ZIP_FILE_DATA)
				.set("Content-Type", "application/x-zip-compressed");
			expect(res.status).to.be.equal(StatusCodes.OK);
			// TODO add assertions that check res.body
			expect(res.body.result).to.have.members(["sections"]);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	it("PUT add dataset with invalid ID", async function () {
		try {
			const res = await request("http://localhost:4321")
				.put("/dataset/test_/sections")
				.send("ZIP_FILE_DATA")
				.set("Content-Type", "application/x-zip-compressed");
			expect(res.status).equal(StatusCodes.BAD_REQUEST);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	it("DELETE remove dataset invalid ID", async function () {
		try {
			const response = await request("http://localhost:4321")
				.delete("/dataset/nonexistent_")
				.send("")
				.set("Content-Type", "application/json");
			expect(response.status).to.be.equal(StatusCodes.BAD_REQUEST);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	it("DELETE remove no such dataset", async function () {
		try {
			const response = await request("http://localhost:4321")
				.delete("/dataset/nonexistent")
				.send("")
				.set("Content-Type", "application/json");
			expect(response.status).to.be.equal(StatusCodes.NOT_FOUND);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	// The other endpoints work similarly. You should be able to find all instructions in the supertest documentation
	it("GET endpoint for list datasets", async function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/datasets";

		try {
			const res = await request(SERVER_URL).get(ENDPOINT_URL).send("").set("Content-Type", "application/json");
			expect(res.status).to.be.equal(StatusCodes.OK);
			expect(res.body.result).to.have.deep.members([
				{
					id: "sections",
					kind: InsightDatasetKind.Sections,
					numRows: 64612,
				},
			]);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	it("POST endpoint for performQuery", async function () {
		try {
			const res = await request("http://localhost:4321")
				.post("/query")
				.send({
					WHERE: {
						GT: {
							sections_avg: 97,
						},
					},
					OPTIONS: {
						COLUMNS: ["sections_dept", "sections_avg"],
						ORDER: "sections_avg",
					},
				})
				.set("Content-Type", "application/json");
			expect(res.status).to.be.equal(StatusCodes.OK);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	it("POST invalid query", async function () {
		try {
			const response = await request("http://localhost:4321")
				.post("/query")
				.send({})
				.set("Content-Type", "application/json");
			expect(response.status).to.be.equal(StatusCodes.BAD_REQUEST);
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});

	it("DELETE /dataset/:id", async function () {
		try {
			const response = await request("http://localhost:4321")
				.delete("/dataset/sections")
				.send("")
				.set("Content-Type", "application/json");
			expect(response.status).to.be.equal(StatusCodes.OK);
			expect(response.body.result).equal("sections");
		} catch (err) {
			Log.error(err);
			expect.fail();
		}
	});
});
