// Data model class to process and manage pivot table data
class PivotData {
	constructor(input, opts) {
		this.cols = opts.cols || [];
		this.rows = opts.rows || [];
		this.vals = opts.vals || [];
		this.aggregator = opts.aggregator || countAggregator();
		this.filter = opts.filter || (() => true);
		this.sorters = opts.sorters || {};
		this.rowOrder = opts.rowOrder || "key_a_to_z";
		this.colOrder = opts.colOrder || "key_a_to_z";
		this.tree = {};
		this.rowTotals = {};
		this.colTotals = {};
		this.allTotal = opts.aggregator([]);
		this.processData(input);
	}

	processData(input) {
		input.forEach((record) => {
			if (this.filter(record)) {
				const colKey = this.cols.map(c => record[c] || 'null');
				const rowKey = this.rows.map(r => record[r] || 'null');

				const colKeyStr = colKey.join(String.fromCharCode(0));
				const rowKeyStr = rowKey.join(String.fromCharCode(0));

				if (!this.tree[rowKeyStr]) {
					this.tree[rowKeyStr] = {};
				}
				if (!this.tree[rowKeyStr][colKeyStr]) {
					this.tree[rowKeyStr][colKeyStr] = this.aggregator([]);
				}
				this.tree[rowKeyStr][colKeyStr].push(record);

				if (!this.rowTotals[rowKeyStr]) {
					this.rowTotals[rowKeyStr] = this.aggregator([]);
				}
				this.rowTotals[rowKeyStr].push(record);

				if (!this.colTotals[colKeyStr]) {
					this.colTotals[colKeyStr] = this.aggregator([]);
				}
				this.colTotals[colKeyStr].push(record);
				this.allTotal.push(record);
			}
		});
	}

	getRowKeys() {
		const rowKeys = Object.keys(this.rowTotals);
		return this.sortKeys(rowKeys, this.rowOrder);
	}

	getColKeys() {
		const colKeys = Object.keys(this.colTotals);
		return this.sortKeys(colKeys, this.colOrder);
	}

	sortKeys(keys, order) {
		if (order === "key_a_to_z") {
			return keys.sort(this.naturalSort());
		} else if (order === "value_a_to_z") {
			return keys.sort(this.naturalSort());
		} else if (order === "value_z_to_a") {
			return keys.sort(this.naturalSort()).reverse();
		} else {
			return keys.sort(this.naturalSort());
		}
	}

	naturalSort() {
		return (a, b) => {
			return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
		};
	}

	getAggregator(rowKeyStr, colKeyStr) {
		if (rowKeyStr && colKeyStr) {
			return this.tree[rowKeyStr]?.[colKeyStr] || this.aggregator([]);
		} else if (rowKeyStr) {
			return this.rowTotals[rowKeyStr] || this.aggregator([]);
		} else if (colKeyStr) {
			return this.colTotals[colKeyStr] || this.aggregator([]);
		} else {
			return this.allTotal;
		}
	}
}

// Aggregator function to count values
function countAggregator() {
	let count = 0;
	return {
		push: () => { count += 1; },
		value: () => count,
		format: val => val
	};
}

// Function to calculate the span size for merging table cells
function spanSize(arr, i, j) {
	if (i !== 0) {
		let noDraw = true;
		for (let x = 0; x <= j; x++) {
			if (arr[i - 1][x] !== arr[i][x]) {
				noDraw = false;
				break;
			}
		}
		if (noDraw) {
			return -1;
		}
	}
	let len = 1;
	while (i + len < arr.length) {
		let stop = false;
		for (let x = 0; x <= j; x++) {
			if (arr[i][x] !== arr[i + len][x]) {
				stop = true;
				break;
			}
		}
		if (stop) break;
		len++;
	}
	return len;
}

// Function to render the pivot table into an HTML table element
function pivotTableRenderer(pivotData, opts) {
	const defaults = {
		table: {
			clickCallback: null,
			rowTotals: true,
			colTotals: true,
		},
		totals: "Totals",
	};
	opts = Object.assign({}, defaults, opts);

	const colAttrs = pivotData.cols;
	const rowAttrs = pivotData.rows;

	const rowKeys = pivotData.getRowKeys()
		.map(key => key.split(String.fromCharCode(0)))
		.filter(row => row.some(v => v !== 'null' && v.trim() !== ''));
	const colKeys = pivotData.getColKeys()
		.map(key => key.split(String.fromCharCode(0)))
		.filter(col => col.some(v => v !== 'null' && v.trim() !== ''));

	let getClickHandler = null;
	if (opts.table.clickCallback) {
		getClickHandler = function (value, rowValues, colValues) {
			const filters = {};
			colAttrs.forEach((attr, i) => {
				if (colValues[i] != null) {
					filters[attr] = colValues[i];
				}
			});
			rowAttrs.forEach((attr, i) => {
				if (rowValues[i] != null) {
					filters[attr] = rowValues[i];
				}
			});
			return function (e) {
				opts.table.clickCallback(e, value, filters, pivotData);
			};
		};
	}

	const table = document.createElement('table');
	table.className = 'pvtTable';

	// Helper function for cell spanning
	function spanSize(arr, i, j) {
		if (i !== 0) {
			let noDraw = true;
			for (let x = 0; x <= j; x++) {
				if (arr[i - 1][x] !== arr[i][x]) {
					noDraw = false;
					break;
				}
			}
			if (noDraw) {
				return -1;
			}
		}
		let len = 1;
		while (i + len < arr.length) {
			let stop = false;
			for (let x = 0; x <= j; x++) {
				if (arr[i][x] !== arr[i + len][x]) {
					stop = true;
					break;
				}
			}
			if (stop) break;
			len++;
		}
		return len;
	}

	// Build the table header
	const thead = document.createElement('thead');
	for (let j = 0; j < colAttrs.length; j++) {
		const tr = document.createElement('tr');

		if (j === 0 && rowAttrs.length > 0) {
			const th = document.createElement('th');
			th.setAttribute('colspan', rowAttrs.length);
			th.setAttribute('rowspan', colAttrs.length);
			tr.appendChild(th);
		}

		const th = document.createElement('th');
		th.className = 'pvtAxisLabel';
		th.textContent = colAttrs[j];
		tr.appendChild(th);

		for (let i = 0; i < colKeys.length; i++) {
			const colKey = colKeys[i];
			const span = spanSize(colKeys, i, j);
			if (span !== -1) {
				const th = document.createElement('th');
				th.className = 'pvtColLabel';
				th.textContent = colKey[j];
				th.setAttribute('colspan', span);
				if (j === colAttrs.length - 1 && rowAttrs.length !== 0) {
					th.setAttribute('rowspan', 2);
				}
				tr.appendChild(th);
			}
		}

		if (j === 0 && opts.table.rowTotals) {
			const th = document.createElement('th');
			th.className = 'pvtTotalLabel pvtRowTotalLabel';
			th.innerHTML = opts.totals;
			th.setAttribute('rowspan', colAttrs.length + (rowAttrs.length === 0 ? 0 : 1));
			tr.appendChild(th);
		}

		thead.appendChild(tr);
	}

	// Row attribute labels
	if (rowAttrs.length !== 0) {
		const tr = document.createElement('tr');
		rowAttrs.forEach(attr => {
			const th = document.createElement('th');
			th.className = 'pvtAxisLabel';
			th.textContent = attr;
			tr.appendChild(th);
		});
		if (colAttrs.length === 0 && opts.table.rowTotals) {
			const th = document.createElement('th');
			th.className = 'pvtTotalLabel pvtRowTotalLabel';
			th.innerHTML = opts.totals;
			tr.appendChild(th);
		}
		thead.appendChild(tr);
	}

	table.appendChild(thead);

	// Build the table body
	const tbody = document.createElement('tbody');

	for (let i = 0; i < rowKeys.length; i++) {
		const rowKey = rowKeys[i];
		const tr = document.createElement('tr');

		for (let j = 0; j < rowKey.length; j++) {
			const txt = rowKey[j];
			const span = spanSize(rowKeys, i, j);
			if (span !== -1) {
				const th = document.createElement('th');
				th.className = 'pvtRowLabel';
				th.textContent = txt;
				th.setAttribute('rowspan', span);
				if (j === rowAttrs.length - 1 && colAttrs.length !== 0) {
					th.setAttribute('colspan', 2);
				}
				tr.appendChild(th);
			}
		}

		for (let j = 0; j < colKeys.length; j++) {
			const colKey = colKeys[j];
			const aggregator = pivotData.getAggregator(rowKey.join(String.fromCharCode(0)), colKey.join(String.fromCharCode(0)));
			const val = aggregator.value();
			const td = document.createElement('td');
			td.className = `pvtVal row${i} col${j}`;
			td.textContent = aggregator.format(val);
			td.setAttribute('data-value', val);
			if (getClickHandler) {
				td.addEventListener('click', getClickHandler(val, rowKey, colKey));
			}
			tr.appendChild(td);
		}

		// Row totals
		if (opts.table.rowTotals || colAttrs.length === 0) {
			const totalAggregator = pivotData.getAggregator(rowKey.join(String.fromCharCode(0)), '');
			const val = totalAggregator.value();
			const td = document.createElement('td');
			td.className = 'pvtTotal rowTotal';
			td.textContent = totalAggregator.format(val);
			td.setAttribute('data-value', val);

			if (getClickHandler) {
				td.addEventListener('click', getClickHandler(val, rowKey, []));
			}
			tr.appendChild(td);
		}
		tbody.appendChild(tr);
	}

	// Column totals and grand total
	if (opts.table.colTotals || rowAttrs.length === 0) {
		const tr = document.createElement('tr');

		if (opts.table.colTotals || rowAttrs.length === 0) {
			const th = document.createElement('th');
			th.className = 'pvtTotalLabel pvtColTotalLabel';
			th.innerHTML = opts.totals;
			th.setAttribute('colspan', rowAttrs.length + (colAttrs.length === 0 ? 0 : 1));
			tr.appendChild(th);
		}

		for (let j = 0; j < colKeys.length; j++) {
			const colKey = colKeys[j];
			const totalAggregator = pivotData.getAggregator('', colKey.join(String.fromCharCode(0)));
			const val = totalAggregator.value();
			const td = document.createElement('td');
			td.className = 'pvtTotal colTotal';
			td.textContent = totalAggregator.format(val);
			td.setAttribute('data-value', val);
			if (getClickHandler) {
				td.addEventListener('click', getClickHandler(val, [], colKey));
			}
			tr.appendChild(td);
		}

		// Grand total
		if (opts.table.rowTotals || colAttrs.length === 0) {
			const totalAggregator = pivotData.getAggregator('', '');
			const val = totalAggregator.value();
			const td = document.createElement('td');
			td.className = 'pvtGrandTotal';
			td.textContent = totalAggregator.format(val);
			td.setAttribute('data-value', val);
			if (getClickHandler) {
				td.addEventListener('click', getClickHandler(val, [], []));
			}
			tr.appendChild(td);
		}
		tbody.appendChild(tr);
	}

	table.appendChild(tbody);

	// Set data attributes
	table.setAttribute('data-numrows', rowKeys.length);
	table.setAttribute('data-numcols', colKeys.length);
	return table;
}


// The main function to initialise the pivot UI for drag-and-drop and table rendering
function pivotUI(element, input, inputOpts = {}) {
	const opts = {
		cols: inputOpts.cols || [],
		rows: inputOpts.rows || [],
		aggregator: inputOpts.aggregator || countAggregator,
		renderer: inputOpts.renderer || pivotTableRenderer,
		table: {
			clickCallback: inputOpts.clickCallback || null,
			rowTotals: inputOpts.rowTotals !== undefined ? inputOpts.rowTotals : true,
			colTotals: inputOpts.colTotals !== undefined ? inputOpts.colTotals : true,
		},
		totals: inputOpts.totals || "Totals",
		filters: inputOpts.filters || {}, // Track filters for attributes
		...inputOpts
	};

	const pivotData = new PivotData(input, opts);
	const renderer = opts.renderer;

	// Create a UI table structure for drag-and-drop
	const uiTable = document.createElement('table');
	uiTable.classList.add('pvtUi');

	const tr1 = document.createElement('tr');
	const tr2 = document.createElement('tr');

	// Renderer control
	const rendererControl = document.createElement('td');
	rendererControl.classList.add('pvtUiCell');

	const rendererSelect = document.createElement('select');
	rendererSelect.classList.add('pvtRenderer');
	const option = document.createElement('option');
	option.value = 'Table';
	option.textContent = 'Table';
	option.selected = true;
	rendererSelect.appendChild(option);
	rendererControl.appendChild(rendererSelect);

	// Add renderers to the renderer dropdown
	for (const rendererName in renderer) {
		const option = document.createElement('option');
		option.value = rendererName;
		option.textContent = rendererName;
		rendererSelect.appendChild(option);
	}

	// Unused attributes container
	const unusedAttrs = document.createElement('td');
	unusedAttrs.classList.add('pvtAxisContainer', 'pvtUnused', 'pvtUiCell');
	unusedAttrs.style.minHeight = '50px';

	const unusedTitle = document.createElement('div');
	unusedTitle.textContent = 'Unused Attributes';
	unusedAttrs.appendChild(unusedTitle);

	const unusedList = document.createElement('ul');
	unusedAttrs.appendChild(unusedList);

	// Drag-and-drop for unused attributes
	function makeDraggable(attr, target) {
		const li = document.createElement('li');
		li.classList.add('pvtAttr');

		const attrLabel = document.createElement('span');
		attrLabel.classList.add('pvtAttr');
		attrLabel.textContent = attr;

		const triangle = document.createElement('span');
		triangle.classList.add('pvtTriangle');
		triangle.innerHTML = "&#x25BE;"; // Triangle symbol

		li.appendChild(attrLabel);
		li.appendChild(triangle);

		// Handle the filter box display
		triangle.addEventListener('click', (e) => {
			e.stopPropagation();
			showFilterBox(attr, triangle);
		});

		// Set drag data
		li.draggable = true;
		li.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('text/plain', attr);
		});

		target.appendChild(li);
	}

	const attributes = Object.keys(input[0]);
	attributes.forEach(attr => {
		if (!opts.cols.includes(attr) && !opts.rows.includes(attr)) {
			makeDraggable(attr, unusedList);
		}
	});

	// Axis containers for rows and columns
	const rowContainer = document.createElement('td');
	rowContainer.classList.add('pvtAxisContainer', 'pvtRows', 'pvtUiCell');

	const rowList = document.createElement('li');
	rowContainer.appendChild(rowList);

	opts.rows.forEach(row => makeDraggable(row, rowList));

	const colContainer = document.createElement('td');
	colContainer.classList.add('pvtAxisContainer', 'pvtCols', 'pvtUiCell', 'pvtHorizList');

	const colList = document.createElement('li');
	colList.classList.add('pvtHorizList');
	colContainer.appendChild(colList);

	opts.cols.forEach(col => makeDraggable(col, colList));

	// Enable drop zones for rows, columns, and unused attributes
	function enableDropZone(container, axis) {
		let placeholder = null;

		container.addEventListener('dragover', (e) => {
			e.preventDefault(); 

			// Creates a placeholder if it doesn't already exists
			if (!placeholder) {
				placeholder = document.createElement('li');
				placeholder.className = 'pvtPlaceholder';
				container.appendChild(placeholder); 
			}
		});

		container.addEventListener('dragleave', () => {
			// Remove the placeholder when dragging leaves the zone
			if (placeholder && container.contains(placeholder)) {
				container.removeChild(placeholder);
				placeholder = null;
			}
		});

		container.addEventListener('drop', (e) => {
			e.preventDefault();

			// remove placeholder once the drop occurs
			if (placeholder && container.contains(placeholder)) {
				container.removeChild(placeholder);
				placeholder = null;
			}

			const droppedAttr = e.dataTransfer.getData('text/plain');

			// Move the attribute to the corresponding area and remove from the previous list
			if (axis === 'rows' && !opts.rows.includes(droppedAttr)) {
				opts.cols = opts.cols.filter(col => col !== droppedAttr); 
				opts.rows.push(droppedAttr);
				removeAttributeFromLists(droppedAttr);
				makeDraggable(droppedAttr, rowList);
			} else if (axis === 'cols' && !opts.cols.includes(droppedAttr)) {
				opts.rows = opts.rows.filter(row => row !== droppedAttr);
				opts.cols.push(droppedAttr);
				removeAttributeFromLists(droppedAttr);
				makeDraggable(droppedAttr, colList);
			} else if (axis === 'unused') {
				opts.rows = opts.rows.filter(r => r !== droppedAttr);
				opts.cols = opts.cols.filter(c => c !== droppedAttr);
				removeAttributeFromLists(droppedAttr);
				makeDraggable(droppedAttr, unusedList);
			}

			refresh();
		});
	}

	// Helper function to remove the attribute from any of the lists
	function removeAttributeFromLists(attr) {
		[rowList, colList, unusedList].forEach(list => {
			Array.from(list.children).forEach(child => {
				if (child.querySelector('.pvtAttr').textContent === attr) {
					child.remove();
				}
			});
		});
	}

	enableDropZone(rowContainer, 'rows');
	enableDropZone(colContainer, 'cols');
	enableDropZone(unusedAttrs, 'unused');

	tr1.appendChild(rendererControl);
	tr1.appendChild(colContainer);
	tr1.appendChild(unusedAttrs);
	tr2.appendChild(rowContainer);

	// Append the pivot table itself to the UI
	const tableContainer = document.createElement('td');
	tableContainer.classList.add('pvtRendererArea');

	// Generate the initial table
	const table = renderer(pivotData, opts);
	tableContainer.appendChild(table);
	tr2.appendChild(tableContainer);

	uiTable.appendChild(tr1);
	uiTable.appendChild(tr2);

	// Clear previous UI and append the new one
	while (element.firstChild) {
		element.removeChild(element.firstChild);
	}
	element.appendChild(uiTable);

	// Function to show the filter box for a specific attribute
	function showFilterBox(attr, triangle) {
		const uniqueValues = [...new Set(input.map(record => record[attr]))];

		// Calculate the counts for each unique value
		const counts = uniqueValues.map(val => {
			return input.filter(record => record[attr] === val).length;
		});

		// Calculate position of the filter box relative to the triangle
		const triangleRect = triangle.getBoundingClientRect();
		const filterBox = document.createElement('div');
		filterBox.classList.add('pvtFilterBox');
		filterBox.style.top = `${triangleRect.bottom + window.scrollY}px`;
		filterBox.style.left = `${triangleRect.left + window.scrollX}px`;

		filterBox.innerHTML = `
        <h4>${attr} (${uniqueValues.length})</h4>
        <div class="pvtCheckContainer">
          ${uniqueValues.map((val, index) => `
            <label>
              <input type="checkbox" value="${val}" checked>
              ${val} (${counts[index]})
            </label>
          `).join('')}
        </div>
        <button class="pvtApplyFilter">Apply</button>
        <button class="pvtCloseFilter">Cancel</button>
      `;

		document.body.appendChild(filterBox);

		// Apply filter on click
		filterBox.querySelector('.pvtApplyFilter').addEventListener('click', () => {
			const checkedValues = Array.from(filterBox.querySelectorAll('input[type=checkbox]:checked')).map(checkbox => checkbox.value);

			opts.filters[attr] = checkedValues;

			document.body.removeChild(filterBox);
			refresh();
		});

		// Close filter box on button click
		filterBox.querySelector('.pvtCloseFilter').addEventListener('click', () => {
			document.body.removeChild(filterBox);
		});
	}

	// Function to refresh the pivot table on drag-and-drop or filter application
	function refresh() {
		const updatedOpts = {
			...opts,
			cols: Array.from(colList.children).map(li => li.querySelector('.pvtAttr').textContent.trim()),
			rows: Array.from(rowList.children).map(li => li.querySelector('.pvtAttr').textContent.trim()),
			filters: opts.filters
		};

		updatedOpts.rows = updatedOpts.rows.filter(row => row !== '');
		updatedOpts.cols = updatedOpts.cols.filter(col => col !== '');

		// Filter the input based on filters applied
		const filteredInput = input.filter(record => {
			return Object.keys(updatedOpts.filters).every(attr => {
				const filterValues = updatedOpts.filters[attr];
				return filterValues.includes(record[attr]);
			});
		});

		const newPivotData = new PivotData(filteredInput, updatedOpts);
		const newTable = renderer(newPivotData, updatedOpts);

		while (tableContainer.firstChild) {
			tableContainer.removeChild(tableContainer.firstChild);
		}

		tableContainer.appendChild(newTable);
	}
}
