// import { Chart } from "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.esm.js";


const addDatasetBtn = document.getElementById("upload");
const displayChartBtn = document.getElementById("updateChart");

let myChart = null;

document.addEventListener('DOMContentLoaded', async function() {
	document.getElementById("chooseDataset").addEventListener('change', updateDepartments);
	document.getElementById("dept").addEventListener('change', updateCourses);
	await updateDatasets();
}, false);

displayChartBtn.addEventListener("click", async function() {
	const datasetSelect = document.getElementById('chooseDataset');
	const selectedDataset = datasetSelect.value;

	const insightSelect = document.getElementById('insightType');
    const selectedInsight = insightSelect.value;

	const deptSelect = document.getElementById('dept');
    const selectedDept = deptSelect.value;

    const courseNumSelect = document.getElementById('courseNumber');
    const selectedNum = courseNumSelect.value;

    if (!selectedDept || !selectedNum || !selectedInsight || !selectedDataset) {
		alert('Need to select both number, department, insight, and dataset my man');
		return;
    }

    await fetchQueryResult(selectedNum, selectedDept, selectedDataset, selectedInsight);

}, false)



addDatasetBtn.addEventListener("click", async () => {
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
		const json = await response.json();

		if (response.status === 200) {
			await updateDatasets();
		} else if (response.status === 400) {
			alert(json.error);
		}

	} catch (err) {
		alert("heeheeheehaw");
	}
});

async function fetchQueryResult(num, dept, dataset, insight) {
	switch (insight) {
      case "Course Averages":
      	const avgKey = dataset + "_avg";
      	const yearKey = dataset + "_year";

      	const result1 = await fetch("/query", {
        		method: "POST",
        		headers: {
        			"Content-Type": "application/json"
        		},
        		body: JSON.stringify({
        			"WHERE": {"AND" : [{"IS" : {[dataset + "_dept"]: dept}},
        			 				  {"IS" : {[dataset + "_id"] : num}}]},
        			"OPTIONS": {
        				"COLUMNS": [
        					yearKey,
        					"overallAvg"
        				],
        				"ORDER" : {
        					"dir" : "UP",
        					"keys": [yearKey]
        				}
        			},
        			"TRANSFORMATIONS": {
        				"GROUP": [
        					yearKey
        				],
        				"APPLY": [
							{
								"overallAvg" : {
									"AVG" : avgKey
								}
							}
						]
        			}
        		})
        	})
		  const jsonRes1 = await result1.json();
		  buildChartSectionsAndAverages(jsonRes1, dataset, dept, num, false);
		  return;
      case "Pass vs Fail":
      	const result2 = await fetch("/query", {
                		method: "POST",
                		headers: {
                			"Content-Type": "application/json"
                		},
                		body: JSON.stringify({
                			"WHERE": {"AND" : [{"IS" : {[dataset + "_dept"]: dept}},
                			 				  {"IS" : {[dataset + "_id"] : num}}]},
                			"OPTIONS": {
                				"COLUMNS": [
                					dataset + "_year",
                					"overallPass",
                					"overallFail"
                				],
                				"ORDER" : {
                					"dir" : "UP",
                					"keys": [dataset + "_year"]
                				}
                			},
                			"TRANSFORMATIONS": {
                				"GROUP": [
									dataset + "_year"
                				],
                				"APPLY": [
        							{
        								"overallPass" : {
        									"SUM": dataset + "_pass"
        								}
        							},
									{
										"overallFail":{
											"SUM": dataset + "_fail"
										}
									}
        						]
                			}
                		})
                	})
        	const jsonRes2 = await result2.json();
		  	break;
      case "Number of Sections":
      const result3 = await fetch("/query", {
                      		method: "POST",
                      		headers: {
                      			"Content-Type": "application/json"
                      		},
                      		body: JSON.stringify({
                      			"WHERE": {"AND" : [{"IS" : {[dataset + "_dept"]: dept}},
                      			 				  {"IS" : {[dataset + "_id"] : num}}]},
                      			"OPTIONS": {
                      				"COLUMNS": [
                      					dataset + "_year",
                      					"overallSections",
                      				],
                      				"ORDER" : {
                      					"dir" : "UP",
                      					"keys": [dataset + "_year"]
                      				}
                      			},
                      			"TRANSFORMATIONS": {
                      				"GROUP": [
      									dataset + "_year"
                      				],
                      				"APPLY": [
              							{
											"overallSections" : {
              									"COUNT": dataset + "_uuid"
              								}
              							}
              						]
                      			}
                      		})
                      	})
		  const jsonRes3 = await result3.json();
		  buildChartSectionsAndAverages(jsonRes3, dataset, dept, num, true);
    }
}

function buildChartPassFail(jsonData, dataset, dept, num) {

}


function buildChartSectionsAndAverages(jsonData, dataset, dept, num, sections) {
    const labels = jsonData.result.map(item => item[dataset + "_year"]);
	let title;
	let overall;
    if (!sections) {
    	overall = jsonData.result.map(item => item.overallAvg);
		title = "Overall Avg. ";
    } else {
		overall = jsonData.result.map(item => item.overallSections);
		title = "# of Sections ";
    }

    const ctx = document.getElementById('myChart')?.getContext('2d');

     if (myChart) {
        myChart.destroy();
     }

    myChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: [title + dept + ' ' + num],
          data: overall,
          borderWidth: 2,
          fill: false
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: false
          }
        }
      }
    });
}


async function updateDatasets() {
	const response = await fetch("/datasets");
	const json = await response.json();
	const listGroup = document.getElementById("datasetList");
	const noDatasets = document.getElementById("no-datasets");
	const chooseDataset = document.getElementById("chooseDataset");


	listGroup.innerHTML = "";
	chooseDataset.innerHTML = `<option selected disabled>Choose...</option>`;

	json.result.forEach((dataset) => {
		const item = document.createElement("li");
		item.className = "list-group-item d-flex justify-content-between align-items-center";

		item.innerHTML = `
        <span>${dataset.id}</span>
        <button id="${dataset.id}" class="btn btn-sm btn-outline-danger" onclick="removeDataset(this)">Remove</button>
      `;

		listGroup.appendChild(item);

		const option = document.createElement("option");
		option.value = dataset.id;
		option.textContent = dataset.id;
		chooseDataset.appendChild(option);
	});

	if (json.result.length === 0) {
		noDatasets.className = `text-secondary align-content-center`;
	} else {
		noDatasets.className = `d-none`;
	}
}



async function removeDataset(button) {
	const response = await fetch("/dataset/" + button.id, { method: "DELETE" });

	const deptsDsp = document.getElementById("dept");
	const numbers = document.getElementById("courseNumber");

	numbers.innerHTML = `<option selected disabled>Course #</option>`;
	deptsDsp.innerHTML = `<option selected disabled>Dept.</option>`;

	await updateDatasets();
}

async function updateDepartments() {
	const deptsDsp = document.getElementById("dept");
	const dataset = document.getElementById("chooseDataset").value;

	console.log(dataset)

	deptsDsp.innerHTML = `<option selected disabled>Dept.</option>`;
	const key = dataset + "_dept";

	console.log(key);

	const result = await fetch("/query", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			"WHERE": {},
			"OPTIONS": {
				"COLUMNS": [
					key
				],
				"ORDER" : {
					"dir" : "UP",
					"keys": [key]
				}
			},
			"TRANSFORMATIONS": {
				"GROUP": [
					key
				],
				"APPLY": []
			}
		})
	})

	const json = await result.json();
	console.log(json)

	for (const result of json.result) {
		const option = document.createElement("option");
		option.value = result[key];
		option.textContent = result[key];
		deptsDsp.appendChild(option);
	}
}

async function updateCourses() {
	const numbers = document.getElementById("courseNumber");
	const dataset = document.getElementById("chooseDataset").value;
	const deptName = document.getElementById("dept").value;

	numbers.innerHTML = `<option selected disabled>Course #</option>`;
	const key = dataset + "_dept";

	const result = await fetch("/query", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			"WHERE": {
				"IS" : {
					[key] : deptName
				}
			},
			"OPTIONS": {
				"COLUMNS": [
					dataset + "_id"
				],
				"ORDER" : {
					"dir" : "UP",
					"keys": [ dataset + "_id" ]
				}
			},
			"TRANSFORMATIONS": {
				"GROUP": [
					dataset + "_id"
				],
				"APPLY": []
			}
		})
	})

	const json = await result.json();

	for (const result of json.result) {
		const option = document.createElement("option");
		option.value = result[dataset + "_id"];
		option.textContent = result[dataset + "_id"];
		numbers.appendChild(option);
	}
}


