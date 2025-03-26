

const addDatasetBtn = document.getElementById("upload");

document.addEventListener('DOMContentLoaded', async function() {
	await updateDatasets();
}, false);

addDatasetBtn.addEventListener("click", async (e) => {
	const file = document.getElementById("zipFile").files[0];
	const datasetId = document.getElementById("datasetId").value;
	console.log(datasetId);
	console.log(file);

	try {
		const response = await fetch("/dataset/" + datasetId + "/sections", {
			method: "PUT",
			headers: {
				"Content-Type": file.type || "application/octet-stream"
			},
			body: file
		});

		if (response.status === 200) {
			await updateDatasets();
		}
	} catch (err) {
		alert("heeheeheehaw");
	}
});

async function updateDatasets() {
	const response = await fetch("/datasets");
	const json = await response.json();
	const listGroup = document.getElementById("datasetList");
	const noDatasets = document.getElementById("no-datasets");

	listGroup.innerHTML = "";

	json.result.forEach((dataset) => {
		const item = document.createElement("li");
		item.className = "list-group-item d-flex justify-content-between align-items-center";

		item.innerHTML = `
        <span>${dataset.id}</span>
        <button id="${dataset.id}" class="btn btn-sm btn-outline-danger" onclick="removeDataset(this)">Remove</button>
      `;

		listGroup.appendChild(item);
	});

	if (json.result.length === 0) {
		noDatasets.className = `text-secondary align-content-center`;
	} else {
		noDatasets.className = `d-none`;
	}
}


async function removeDataset(button) {
	const response = await fetch("/dataset/" + button.id, { method: "DELETE" });
	await updateDatasets();
}

