Module.register("MMM-MyWastePickup", {
  defaults: {
    collectionCalendar: "Tuesday1",
    weeksToDisplay: 2,
    limitTo: 99,
    mrGreenCalendarUrl: "https://mr-green.ch/was-wo-wann-und-wie/?fwp_abholkalender=3156"
  },

  validCollectionCalendars: [
    "MondayNight",
    "Tuesday1",
    "Tuesday2",
    "Wednesday1",
    "Wednesday2",
    "Thursday1",
    "Thursday2",
    "Friday1",
    "Friday2",
    "Custom"
  ],

  germanLabels: {
    garbage: "Kehricht",
    compost: "Grüntour",
    recycle: "Papier/Karton",
    mr_green: "Mr. Green"
  },

  // Define required styles.
  getStyles: function() {
    return ["MMM-MyWastePickup.css"];
  },

  start: function() {
    Log.info("Starting module: " + this.name);

    this.nextPickups = [];

    if (
      this.validCollectionCalendars.indexOf(this.config.collectionCalendar) ==
      -1
    ) {
      this.config.collectionCalendar = "Tuesday1";
    }

    this.getPickups();

    this.timer = null;
  },

  getPickups: function() {
    clearTimeout(this.timer);
    this.timer = null;

    this.sendSocketNotification("MMM-MYWASTEPICKUP-GET", {
      ...this.config,
      identifier: this.identifier
    });

    //set alarm to check again tomorrow
    var self = this;
    this.timer = setTimeout(function() {
      self.getPickups();
    }, 60 * 60 * 1000); //update once an hour
  },

  socketNotificationReceived: function(notification, payload) {
    if (
      notification == "MMM-MYWASTEPICKUP-RESPONSE" + this.identifier &&
      payload.length > 0
    ) {
      this.nextPickups = payload;
      this.updateDom(1000);
      this.handleTelegramNotifications(this.nextPickups);
    }
  },

  svgIconFactory: function(glyph) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttributeNS(null, "class", "waste-pickup-icon " + glyph);
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "href",
      this.file("icon_sprite.svg#") + glyph
    );
    svg.appendChild(use);

    return svg;
  },

  createIconLegendEntry: function(description, iconName) {
    var legendContainer = document.createElement("div");
    legendContainer.classList.add("legend-container");

    var iconContainer = document.createElement("span");
    iconContainer.classList.add("waste-pickup-icon-legend-container");
    iconContainer.appendChild(this.svgIconFactory(iconName));
    legendContainer.appendChild(iconContainer);

    var descriptionContainer = document.createElement("span");
    descriptionContainer.classList.add("pickup-date");
    descriptionContainer.innerHTML = description;
    legendContainer.appendChild(descriptionContainer);

    return legendContainer;
  },

  getDom: function() {
    var wrapper = document.createElement("div");

    if (this.nextPickups.length == 0) {
      wrapper.innerHTML = this.translate("LOADING");
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    var pickupWrapper = document.createElement("div");
    pickupWrapper.classList.add("pickup-wrapper");

    for (i = 0; i < this.nextPickups.length; i++) {
      if (i == this.config.limitTo) {
        break;
      }

      var pickup = this.nextPickups[i];

      var pickupContainer = document.createElement("div");
      pickupContainer.classList.add("pickup-container");

      //add pickup date
      var dateContainer = document.createElement("span");
      dateContainer.classList.add("pickup-date");

      //determine how close pickup day is and formats accordingly.
      var today = moment().startOf("day");
      var pickUpDate = moment(pickup.PickupDate);
      if (today.isSame(pickUpDate)) {
        dateContainer.innerHTML = this.translate("TODAY");
      } else if (
        moment(today)
          .add(1, "days")
          .isSame(pickUpDate)
      ) {
        dateContainer.innerHTML = this.translate("TOMORROW");
      } else if (
        moment(today)
          .add(7, "days")
          .isAfter(pickUpDate)
      ) {
        dateContainer.innerHTML = pickUpDate.format("dddd");
      } else {
        dateContainer.innerHTML = pickUpDate.format("MMMM D");
      }

      pickupContainer.appendChild(dateContainer);

      //add icons
      var iconContainer = document.createElement("span");
      iconContainer.classList.add("waste-pickup-icon-container");

      if (pickup.GreenBin) {
        iconContainer.appendChild(this.svgIconFactory("compost"));
      }
      if (pickup.Garbage) {
        iconContainer.appendChild(this.svgIconFactory("garbage"));
      }
      if (pickup.Recycling) {
        iconContainer.appendChild(this.svgIconFactory("recycle"));
      }
      if (pickup.MrGreen) {
        iconContainer.appendChild(this.svgIconFactory("mr_green"));
      }
      if (pickup.ChristmasTree) {
        iconContainer.appendChild(this.svgIconFactory("christmas_tree"));
      }

      pickupContainer.appendChild(iconContainer);

      pickupWrapper.appendChild(pickupContainer);
    }

    wrapper.appendChild(pickupWrapper);

    // Create icon descriptions
    var legendWrapperUpper = document.createElement("div");
    legendWrapperUpper.classList.add("legend-wrapper");
    legendWrapperUpper.classList.add("light");
    legendWrapperUpper.appendChild(this.createIconLegendEntry(this.germanLabels.garbage, "garbage"));
    legendWrapperUpper.appendChild(this.createIconLegendEntry(this.germanLabels.compost, "compost"));

    var legendWrapperLower = document.createElement("div");
    legendWrapperLower.classList.add("legend-wrapper");
    legendWrapperLower.classList.add("light");
    legendWrapperLower.appendChild(this.createIconLegendEntry(this.germanLabels.recycle, "recycle"));
    legendWrapperLower.appendChild(this.createIconLegendEntry(this.germanLabels.mr_green, "mr_green"));

    wrapper.appendChild(legendWrapperUpper);
    wrapper.appendChild(legendWrapperLower);

    return wrapper;
  },

  handleTelegramNotifications: function(pickups) {
    const today = moment().startOf('day');

    pickups.forEach(pickup => {
      const currentHour = moment().hour();
      // check if it is 18:00 o'clock one day before a pickup
      if (moment(today).hour(currentHour).isSame(moment(pickup.PickupDate).subtract(1, 'days').hour(20), 'hour')) {
        this.sendTelegramMessage('*Morn:*', pickup);
      }
      // check if pickup is today
      else if (moment(today).hour(currentHour).isSame(moment(pickup.PickupDate).hour(7), 'hour')) {
        this.sendTelegramMessage('‼️*Hüt:*‼️', pickup);
      }
    });

  },

  sendTelegramMessage: function(customText, pickup) {
    let message = '♻️🚮 WG-Abfall Reminder 🚮♻️\n\n';

    message += customText + '\n';

    if (pickup.Garbage) {
      message += '- `' + this.germanLabels.garbage + '`\n';
    }
    if (pickup.GreenBin) {
      message += '- `' + this.germanLabels.compost + '`\n';
    }
    if (pickup.Recycling) {
      message += '- `' + this.germanLabels.recycle + '`\n';
    }
    if (pickup.MrGreen) {
      message += '- `' + this.germanLabels.mr_green + '`\n';
    }

    this.sendNotification('TELBOT_TELL_ADMIN', message);
  }
});
