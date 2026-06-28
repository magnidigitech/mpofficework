export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export function parseDateFilter(preset: string, customStart?: string, customEnd?: string): DateRange {
  const now = new Date();
  
  // Date values initialized in local context and structured around UTC/Kolkata boundary resets
  let start = new Date(now);
  let end = new Date(now);
  let label = "Last 30 Days";

  // helper to set start of day
  const setStartOfDay = (d: Date) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // helper to set start of next day (exclusive boundary)
  const setStartOfNextDay = (d: Date) => {
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  switch (preset) {
    case "today": {
      setStartOfDay(start);
      setStartOfNextDay(end);
      label = "Today";
      break;
    }
    case "yesterday": {
      start.setDate(start.getDate() - 1);
      setStartOfDay(start);
      end.setDate(end.getDate() - 1);
      setStartOfNextDay(end);
      label = "Yesterday";
      break;
    }
    case "this_week": {
      const day = start.getDay(); // 0 is Sun, 1 is Mon
      const diffToSun = day;
      start.setDate(start.getDate() - diffToSun);
      setStartOfDay(start);
      end.setDate(start.getDate() + 7);
      setStartOfDay(end);
      label = "This Week";
      break;
    }
    case "this_month": {
      start.setDate(1);
      setStartOfDay(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(1);
      setStartOfDay(end);
      label = "This Month";
      break;
    }
    case "previous_month": {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      setStartOfDay(start);
      end.setDate(1);
      setStartOfDay(end);
      label = "Previous Month";
      break;
    }
    case "custom": {
      if (customStart) {
        start = new Date(customStart);
        setStartOfDay(start);
      } else {
        start.setDate(1);
        setStartOfDay(start);
      }
      if (customEnd) {
        end = new Date(customEnd);
        setStartOfNextDay(end);
      } else {
        setStartOfNextDay(end);
      }
      label = `Custom Range: ${start.toLocaleDateString("en-IN")} to ${new Date(end.getTime() - 86400000).toLocaleDateString("en-IN")}`;
      break;
    }
    default: {
      // Default to last 30 days
      start.setDate(start.getDate() - 30);
      setStartOfDay(start);
      setStartOfNextDay(end);
      label = "Last 30 Days";
    }
  }

  return {
    start,
    end,
    label,
  };
}
