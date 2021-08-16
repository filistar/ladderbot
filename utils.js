require("dotenv").config();
const { Pool } = require("pg");
const needle = require("needle");

const LADDER_URL = "https://alttprladder.com/api/v1/PublicAPI/";
let sqlPool;

/**
 * initializeDatabase
 */
function initializeDatabase() {
	sqlPool = new Pool({
		connectionString: process.env.DATABASE_URL,
		user: process.env.DATABASE_USER,
		ssl: {
			rejectUnauthorized: false,
		},
	});
}

/**
 * executeSelect
 * @param {String} table table name
 * @param {String} fields fields to show
 * @param {String = null} where search clause
 * @param {Object[] = null} whereValues where values to search for
 * @returns select response
 */
function executeSelect(table, fields, where = null, whereValues = null) {
	const whereCall = where !== null ? `WHERE ${where}` : "";
	return new Promise(async (resolve, reject) => {
		const sqlClient = await sqlPool.connect();
		try {
			await sqlClient.query(`SELECT ${fields} FROM ${table} ${whereCall};`, whereValues, (err, res) => {
				if (err) throw err;
				resolve(res);
			});
		} catch (error) {
			console.error(error.stack);
			reject(error);
		} finally {
			sqlClient.release();
		}
	});
}

/**
 * executeInsert
 * @param {String} table table name
 * @param {String} fields fields names to insert
 * @param {Object[]} insertValues values to insert
 * @returns insert response
 */
function executeInsert(table, fields, insertValues) {
	let valuesMask = "";
	insertValues.forEach((element, index) => {
		valuesMask += `$${index + 1}${index + 1 === insertValues.length ? "" : ", "}`;
	});
	return new Promise(async (resolve, reject) => {
		const sqlClient = await sqlPool.connect();
		try {
			await sqlClient.query(`INSERT INTO ${table} (${fields}) VALUES (${valuesMask});`, insertValues, (err, res) => {
				if (err) throw err;
				resolve(res);
			});
		} catch (error) {
			console.error(error.stack);
			reject(error);
		} finally {
			sqlClient.release();
		}
	});
}

/**
 * executeDelete
 * @param {String} table table name
 * @param {String} fields fields for where clause
 * @param {Object[]} deleteValues values used for where clause
 * @returns
 */
function executeDelete(table, fields, deleteValues) {
	return new Promise(async (resolve, reject) => {
		if (!fields || fields.trim().length === 0 || !deleteValues || deleteValues.length === 0) {
			reject();
		}
		const sqlClient = await sqlPool.connect();
		try {
			await sqlClient.query(`DELETE FROM ${table} WHERE ${fields};`, deleteValues, (err, res) => {
				if (err) throw err;
				resolve(res);
			});
		} catch (error) {
			console.error(error.stack);
			reject(error);
		} finally {
			sqlClient.release();
		}
	});
}

/**
 * loadRegisteredUsers
 * @returns users registered
 */
function loadRegisteredUsers() {
	const channelList = [];
	return new Promise((resolve, reject) => {
		executeSelect("registered_channels", "id, channel")
			.then((response) => {
				for (let row of response.rows) {
					channelList.push(row.channel);
				}
				resolve(channelList);
			})
			.catch((error) => reject(error));
	});
}

/**
 * checkUserOrIdRepeated
 * @param {String} channel channel name to check repeated
 * @param {Number} ladderId ladder id to check repeated
 * @returns Object found: true if theres a channel or id repeated
 * @returns Object channel: true if theres a channel repeated
 * @returns Object ladderId: true if theres an id repeated
 */
function checkUserOrIdRepeated(channel, ladderId) {
	return new Promise((resolve, reject) => {
		executeSelect("registered_channels", "channel, ladder_id", "channel=$1", [channel])
			.then((response) => {
				if (response.rows[0]) {
					resolve({ found: true, channel: true });
				} else {
					executeSelect("registered_channels", "channel, ladder_id", "ladder_id=$1", [ladderId]).then((response) => {
						if (response.rows[0]) {
							resolve({ found: true, ladderId: true });
						} else {
							resolve({ found: false });
						}
					});
				}
			})
			.catch((error) => reject(error));
	});
}

/**
 * insertNewChannelLadderId
 * @param {String} username user to insert
 * @param {Number} ladderId ladder id to insert
 * @returns insert result, code if there's a unique restriction error
 */
function insertNewChannelLadderId(username, ladderId) {
	return new Promise((resolve, reject) => {
		executeInsert("registered_channels", "channel, ladder_id", [username, ladderId])
			.then(resolve())
			.catch((error) => {
				if (error.code === "23505") {
					resolve({ code: error.code });
				} else {
					reject(error);
				}
			});
	});
}

/**
 * deleteRegisteredUser
 * @param {String} username user to delete
 * @returns delete result
 */
function deleteRegisteredUser(username) {
	return new Promise((resolve, reject) => {
		executeDelete("registered_channels", "channel=$1", [username]).then(resolve()).catch(reject());
	});
}

/**
 * Handles the requests to the Ladder API
 * @param {string} path
 */
function makeLadderRequest(path) {
	console.log("makeLadderRequest -", `${LADDER_URL}${path}`);

	const request = new Promise((resolve, reject) => {
		needle("get", `${LADDER_URL}${path}`)
			.then((response) => {
				if (response.statusCode === 200) {
					resolve({
						success: true,
						body: response.body,
						errorMessage: null,
					});
				} else {
					resolve({
						success: false,
						body: null,
						errorMessage: `Something went wrong. Status code: ${response.statusCode} . Path: ${path}`,
					});
				}
			})
			.catch((error) => {
				reject({
					success: false,
					body: null,
					errorMessage: error,
				});
			});
	});
	return request;
}

module.exports = { initializeDatabase, loadRegisteredUsers, checkUserOrIdRepeated, insertNewChannelLadderId, deleteRegisteredUser, makeLadderRequest };
