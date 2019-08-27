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

      wrapper.appendChild(pickupContainer);
    }

    // Create icon legend
    wrapper.appendChild(document.createElement("br"));
    wrapper.appendChild(this.createIconLegendEntry("Kehricht", "garbage"));
    wrapper.appendChild(this.createIconLegendEntry("Grüntour", "compost"));
    wrapper.appendChild(this.createIconLegendEntry("Papier/Karton", "recycle"));
    wrapper.appendChild(this.createIconLegendEntry("Mr. Green", "mr_green"));

    return wrapper;
  }
});
