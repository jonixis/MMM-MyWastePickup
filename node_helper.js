var NodeHelper = require("node_helper");
var fs = require("fs");
var parse = require("csv-parse");
var moment = require("moment");
var osmosis = require("osmosis");

module.exports = NodeHelper.create({

  germanMonths: new Map([
    ["Januar", "01"],
    ["Februar", "02"],
    ["März", "03"],
    ["April", "04"],
    ["Mai", "05"],
    ["Juni", "06"],
    ["Juli", "07"],
    ["August", "08"],
    ["September", "09"],
    ["Oktober", "10"],
    ["November", "11"],
    ["Dezember", "12"],
  ]),

  start: function() {
    console.log("Starting node_helper for module: " + this.name);

    this.schedule = null;

    //new schedule file can be downloaded at
    //https://www.toronto.ca/city-government/data-research-maps/open-data/open-data-catalogue/garbage-and-recycling/#8e932504-cabb-71b1-b23a-6cf504f7c474
    this.scheduleCSVFile = this.path + "/schedule.csv";

    this.scheduleCustomCSVFile = this.path + "/schedule_custom.csv";
  },

  socketNotificationReceived: function(notification, payload) {
    var self = this;

    if (this.schedule == null) {
      //not yet setup. Load and parse the data file; set up variables.

      var scheduleFile = this.scheduleCSVFile;
      if (payload.collectionCalendar == "Custom") {
        scheduleFile = this.scheduleCustomCSVFile;
      }

      fs.readFile(scheduleFile, "utf8", function(err, rawData) {
        if (err) throw err;
        parse(rawData, { delimiter: ",", columns: true, ltrim: true }, function(
          err,
          parsedData
        ) {
          if (err) throw err;

          self.schedule = parsedData;
          self.postProcessSchedule();
          self.getNextPickups(payload);
        });
      });
    } else {
      this.getNextPickups(payload);
    }
  },

  postProcessSchedule: function() {
    this.schedule.forEach(function(obj) {
      //convert date strings to moment.js Date objects
      obj.PickupDate = moment(obj.PickupDate, "MM/DD/YY");

      // to do:
      // check if pickup date lands on a holiday.
      // If so, move to next day

      //reassign strings to booleans for particular waste type
      obj.GreenBin = obj.GreenBin == "0" ? false : true;
      obj.Garbage = obj.Garbage == "0" ? false : true;
      obj.Recycling = obj.Recycling == "0" ? false : true;
      obj.MrGreen = obj.MrGreen == "0" ? false : true;
      obj.ChristmasTree = obj.ChristmasTree == "0" ? false : true;
    });
  },

  getNextPickups: function(payload) {
    var start = moment().startOf("day"); //today, 12:00 AM
    var end = moment()
      .startOf("day")
      .add(payload.weeksToDisplay * 7, "days");

    //find info for next pickup dates
    var nextPickups = this.schedule.filter(function(obj) {
      return (
        obj.Calendar == payload.collectionCalendar &&
        obj.PickupDate.isSameOrAfter(start) &&
        obj.PickupDate.isBefore(end)
      );
    });

    // Load pick up dates from mr green website
    this.fetchNextMrGreenPickups().then(res => {
      // Remove redundant dates
      res.splice(payload.weeksToDisplay, res.length);

      // Add mr green pickups to nextPickups
      res.forEach((mrGreenDate) => {
        let dateString = [mrGreenDate.month, mrGreenDate.day, mrGreenDate.year]
            .join("/");
        let date = moment(dateString, "MM/DD/YY");
        let isNewDateNeeded = true;
        nextPickups.forEach((nextPickup) => {
          if (nextPickup.PickupDate.isSame(date)) {
            nextPickup.MrGreen = true;
            isNewDateNeeded = false;
          }
        });
        if (isNewDateNeeded
            && date.isBefore(nextPickups[nextPickups.length-1])) {
          let newPickup = {
            Calender: 'Custom',
            PickupDate: date,
            GreenBin: false,
            Garbage: false,
            Recycling: false,
            MrGreen: true,
            ChristmasTree: false
          };
          nextPickups.push(newPickup);
        }
      });

      // Send socket notification to frontend
      this.sendSocketNotification(
        "MMM-MYWASTEPICKUP-RESPONSE" + payload.instanceId,
        nextPickups
      );
    });
  },

  fetchNextMrGreenPickups: function() {
    return new Promise((resolve, reject) => {
      // https://mr-green.ch/was-wo-wann-und-wie/?fwp_abholkalender=3156

      let mrGreenPickupDates = [];

      osmosis
        .get("https://mr-green.ch/was-wo-wann-und-wie/?fwp_abholkalender=3156")
        .find(".col-wrapper")
        .set({
          day: "span.day",
          month: "span.month",
          year: "span.year"
        })
        .data(data => {
          data.month = this.germanMonths.get(data.month);
          data.year = data.year.substring(2);
          mrGreenPickupDates.push(data);
        })
        .error(err => reject(err))
        .done(() => resolve(mrGreenPickupDates));
    });
  }
});
