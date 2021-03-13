var NodeHelper = require("node_helper");
var fs = require("fs");
var parse = require("csv-parse");
var moment = require("moment");
var osmosis = require("osmosis");
var request = require('request');

module.exports = NodeHelper.create({
	germanMonths: new Map([
		["Jan", "01"],
		["Feb", "02"],
		["Mär", "03"],
		["Apr", "04"],
		["Mai", "05"],
		["Jun", "06"],
		["Jul", "07"],
		["Aug", "08"],
		["Sep", "09"],
		["Okt", "10"],
		["Nov", "11"],
		["Dez", "12"]
	]),

	start: function() {
		console.log("Starting node_helper for module: " + this.name);
	},

	socketNotificationReceived: function(notification, payload) {
		this.config = payload;
		this.getNextPickups(payload);
	},

	cleanUpNextPickups: function(nextPickups) {
		let end = moment()
			.startOf("day")
			.add(this.config.weeksToDisplay * 7, "days");

		return nextPickups
			.sort((a, b) => a.PickupDate.diff(b.PickupDate))
			.filter(pickup => {
				return pickup.PickupDate.isBefore(end, "day");
			});
	},

	// TODO: Refactor duplicate code
	getNextPickups: function(payload) {
		// Load next pickups from city website
		let nextPickups = [];

		this.fetchWinterthurWastePickups(payload.wintiCityKehrichtUrl).then(res => {
			// Remove redundant dates
			res.splice(payload.weeksToDisplay, res.length);

			res.forEach(garbageDate => {
				let dateString = [
					garbageDate.month,
					garbageDate.day,
					garbageDate.year
				].join("/");
				let date = moment(dateString, "MM/DD/YY");

				let newPickup = {
					Calender: "Custom",
					PickupDate: date,
					GreenBin: false,
					Garbage: true,
					Recycling: false,
					MrGreen: false
				};

				nextPickups = this.addNewPickup(newPickup, nextPickups);
			});

			this.fetchWinterthurWastePickups(payload.wintiCityGruentourUrl).then(
				res => {
					// Remove redundant dates
					res.splice(payload.weeksToDisplay, res.length);

					res.forEach(greenBinDate => {
						let dateString = [
							greenBinDate.month,
							greenBinDate.day,
							greenBinDate.year
						].join("/");
						let date = moment(dateString, "MM/DD/YY");

						let newPickup = {
							Calender: "Custom",
							PickupDate: date,
							GreenBin: true,
							Garbage: false,
							Recycling: false,
							MrGreen: false
						};

						nextPickups = this.addNewPickup(newPickup, nextPickups);
					});

					this.fetchWinterthurWastePickups(payload.wintiCityRecyclingUrl).then(
						res => {
							// Remove redundant dates
							res.splice(payload.weeksToDisplay, res.length);

							res.forEach(recyclingDate => {
								let dateString = [
									recyclingDate.month,
									recyclingDate.day,
									recyclingDate.year
								].join("/");
								let date = moment(dateString, "MM/DD/YY");

								let newPickup = {
									Calender: "Custom",
									PickupDate: date,
									GreenBin: false,
									Garbage: false,
									Recycling: true,
									MrGreen: false
								};

								nextPickups = this.addNewPickup(newPickup, nextPickups);
							});

							// Load pick up dates from mr green website
							this.fetchNextMrGreenPickups(payload.mrGreenCalendarUrl).then(
								res => {
									// Remove days in past
									// res = res.filter(mrGreenDate => {
									// 	let dateString = [
									// 		mrGreenDate.month,
									// 		mrGreenDate.day,
									// 		mrGreenDate.year
									// 	].join("/");
									// 	let date = moment(dateString, "MM/DD/YY");

									// 	return date.isAfter(
									// 		moment()
									// 			.startOf("day")
									// 			.add(1, "days"),
									// 		"day"
									// 	);
									// });

									// Remove redundant dates
									res.splice(payload.weeksToDisplay, res.length);

									res.forEach(mrGreenDate => {
										let dateString = [
											mrGreenDate.month,
											mrGreenDate.day,
											mrGreenDate.year
										].join("/");
										let date = moment(dateString, "MM/DD/YY");

										let newPickup = {
											Calender: "Custom",
											PickupDate: date,
											GreenBin: false,
											Garbage: false,
											Recycling: false,
											MrGreen: true
										};

										nextPickups = this.addNewPickup(newPickup, nextPickups);
									});

									// Send socket notification to frontend
									this.sendSocketNotification(
										"MMM-MYWASTEPICKUP-RESPONSE" + payload.identifier,
										nextPickups
									);
								}
							);
						}
					);
				}
			);
		});
	},

	addNewPickup: function(newPickup, nextPickups) {
		let isNewDate = true;
		nextPickups.forEach(pickup => {
			if (pickup.PickupDate.isSame(newPickup.PickupDate)) {
				pickup.GreenBin = pickup.GreenBin
					? pickup.GreenBin
					: newPickup.GreenBin;
				pickup.Garbage = pickup.Garbage ? pickup.Garbage : newPickup.Garbage;
				pickup.Recycling = pickup.Recycling
					? pickup.Recycling
					: newPickup.Recycling;
				pickup.MrGreen = pickup.MrGreen ? pickup.MrGreen : newPickup.MrGreen;

				isNewDate = false;
			}
		});

		if (isNewDate) {
			nextPickups.push(newPickup);
		}

		return this.cleanUpNextPickups(nextPickups);
	},

	fetchNextMrGreenPickups: function(mrGreenCalendarUrl) {
		return new Promise((resolve, reject) => {
			let mrGreenPickupDates = [];
			let options = {
				'method': 'POST',
				'url': mrGreenCalendarUrl,
				formData: {
					'action': 'get_dates_by_zip',
					'zipcode': '3156'
				}
			};
			request(options, (error, response) => {
				if (error) throw new Error(error);

				osmosis
					.parse(response.body)
					.find("#get-package-date")
					.set({
						day: "span.day",
						month: "span.month",
						year: "span.year"
					})
					.data(data => {
						data.month = this.germanMonths.get(data.month.substring(0, 3));
						data.year = data.year.substring(2);
						mrGreenPickupDates.push(data);
					})
					.error(err => reject(err))
					.done(() => resolve(mrGreenPickupDates));
			});

		});
	},

	fetchWinterthurWastePickups: function(wintiUrl) {
		return new Promise((resolve, reject) => {
			let wintiPickupDates = [];

			osmosis
				.get(wintiUrl)
				.find(".theRow .tb .tr")
				.set({
					date: "a:first"
				})
				.data(data => {
					let pickupDate = {
						day: "",
						month: "",
						year: ""
					};
					let fixedString = decodeURIComponent(escape(data.date));
					pickupDate.day = fixedString.substring(4, 6);
					pickupDate.month = this.germanMonths.get(fixedString.substring(8, 11));
					pickupDate.year = fixedString.substring(15, 17);
					wintiPickupDates.push(pickupDate);
				})
				.error(err => reject(err))
				.done(() => resolve(wintiPickupDates));
		});
	}
});
