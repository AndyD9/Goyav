<script setup lang="ts">
import { dateLocale, t } from "@/i18n";
import { computed, onMounted, onActivated, onUnmounted, ref, nextTick } from "vue";
import { useCalendarStore } from "@/stores/calendar";
import { useUiStore } from "@/stores/ui";
import {
  getHourInTimezone,
  getMinutesInTimezone,
  getDateInTimezone,
  formatInTimezone,
  startOfDayUTC,
  endOfDayUTC,
} from "@/lib/datetime";
import type { CalendarEvent } from "@/lib/types";
import { calendarDay, isCalendarToday, parseCalendarDay } from "@/lib/calendar-days";
import { dragCalendarEvent, isCalendarDragging, canDragCalendarEvent } from "@/lib/calendar-drag-state";

const props = defineProps<{
  singleDay?: boolean;
}>();

const emit = defineEmits<{
  timeClick: [dateTime: string];
  eventClick: [eventId: string];
  eventReschedule: [payload: {
    eventId: string;
    newStart: string;
    newEnd: string;
    attendeesJson: string | null;
    organizerEmail: string | null;
  }];
}>();

const calendarStore = useCalendarStore();
const uiStore = useUiStore();
const gridRef = ref<HTMLElement | null>(null);

const hours = Array.from({ length: 24 }, (_, i) => i);
// Shared by CSS sizing, event positioning, and pointer hit-testing.
const HOUR_HEIGHT = 52;

// The all-day row scrolls past a user-resizable cap, persisted per device.
const ALL_DAY_HEIGHT_KEY = "chithi-all-day-height";
const ALL_DAY_MIN_HEIGHT = 32;
const allDayMaxHeight = ref(readAllDayHeight());
let allDayResizeCleanup: (() => void) | null = null;

function readAllDayHeight(): number {
  try {
    const stored = parseInt(localStorage.getItem(ALL_DAY_HEIGHT_KEY) || "", 10);
    if (Number.isFinite(stored) && stored >= ALL_DAY_MIN_HEIGHT) return stored;
  } catch {
    // Storage unavailable: fall back to the default cap.
  }
  return 96;
}

function onAllDayResizeStart(e: MouseEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = allDayMaxHeight.value;
  const viewHeight = (e.currentTarget as HTMLElement).parentElement?.clientHeight ?? 600;
  const maxHeight = Math.max(ALL_DAY_MIN_HEIGHT, Math.floor(viewHeight * 0.6));

  const handleMove = (ev: MouseEvent) => {
    const next = startHeight + ev.clientY - startY;
    allDayMaxHeight.value = Math.round(Math.min(maxHeight, Math.max(ALL_DAY_MIN_HEIGHT, next)));
  };
  const handleUp = () => {
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("mouseup", handleUp);
    allDayResizeCleanup = null;
    try {
      localStorage.setItem(ALL_DAY_HEIGHT_KEY, String(allDayMaxHeight.value));
    } catch {
      // Not persisted; the size still applies for this session.
    }
  };

  document.body.style.cursor = "row-resize";
  document.addEventListener("mousemove", handleMove);
  document.addEventListener("mouseup", handleUp);
  allDayResizeCleanup = handleUp;
}

const days = computed(() => {
  const d = parseCalendarDay(calendarStore.displayDate);
  if (props.singleDay) {
    return [new Date(d)];
  }
  const start = new Date(d);
  const offset = (d.getDay() - uiStore.weekStartDay + 7) % 7;
  start.setDate(d.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
});

const now = ref(new Date());
let nowTimerId: ReturnType<typeof setTimeout> | null = null;

// Tick on each minute boundary so the shown time never lags a minute.
function scheduleNowTick() {
  const delay = 60_000 - (Date.now() % 60_000) + 50;
  nowTimerId = setTimeout(() => {
    now.value = new Date();
    scheduleNowTick();
  }, delay);
}

function formatDayName(date: Date): string {
  return date.toLocaleDateString(dateLocale(), { weekday: "short" }).toUpperCase();
}

function formatDayNum(date: Date): string {
  return String(date.getDate());
}

function formatHour(hour: number): string {
  const h12 = uiStore.hour12;
  if (h12 === false) {
    return String(hour).padStart(2, "0");
  }
  if (h12 === true) {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
  }
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(dateLocale(), { hour: "numeric" });
}

function isToday(date: Date): boolean {
  return isCalendarToday(date, uiStore.displayTimezone, now.value);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  if (uiStore.weekStartDay === 6) {
    return day === 4 || day === 5;
  }
  return day === 0 || day === 6;
}

const todayVisible = computed(() => days.value.some((d) => isToday(d)));

const nowHour = computed(() => getHourInTimezone(now.value.toISOString(), uiStore.displayTimezone));
const nowMinutes = computed(() => getMinutesInTimezone(now.value.toISOString(), uiStore.displayTimezone));

const nowMarkerTop = computed(
  () => `${nowHour.value * HOUR_HEIGHT + (nowMinutes.value / 60) * HOUR_HEIGHT}px`,
);

const nowLabel = computed(() =>
  formatInTimezone(now.value.toISOString(), uiStore.displayTimezone, {
    weekday: undefined,
    month: undefined,
    day: undefined,
    year: undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: uiStore.hour12,
  }),
);

/** The hour label the current-time badge sits on, hidden to avoid overlap. */
function hourLabelCovered(hour: number): boolean {
  if (!todayVisible.value) return false;
  if (nowMinutes.value < 15) return hour === nowHour.value;
  if (nowMinutes.value > 45) return hour === nowHour.value + 1;
  return false;
}

// Cross-midnight events render as one segment per day.
interface EventSegment {
  event: CalendarEvent;
  segStart: Date;
  segEnd: Date;
}

const segmentsByDay = computed(() => {
  const map = new Map<string, EventSegment[]>();

  for (const day of days.value) {
    const dayStr = calendarDay(day);
    const dayStartMs = startOfDayUTC(dayStr, uiStore.displayTimezone);
    const dayEndMs = endOfDayUTC(dayStr, uiStore.displayTimezone);
    const dayStart = new Date(dayStartMs);
    const dayEnd = new Date(dayEndMs);
    const segs: EventSegment[] = [];

    for (const e of calendarStore.visibleEvents) {
      const eStart = new Date(e.start_time);
      const eEnd = new Date(e.end_time);
      if (e.all_day || (eEnd.getTime() - eStart.getTime() > 24 * 60 * 60 * 1000)) continue;
      if (eStart > dayEnd || eEnd <= dayStart) continue;

      const segStart = eStart < dayStart ? dayStart : eStart;
      const segEnd = eEnd > dayEnd ? new Date(dayEnd.getTime() + 1) : eEnd;
      segs.push({ event: e, segStart, segEnd });
    }

    map.set(dayStr, segs);
  }
  return map;
});

function segmentsForDay(date: Date): EventSegment[] {
  const dayStr = calendarDay(date);
  return segmentsByDay.value.get(dayStr) || [];
}

// Assign overlapping events to side-by-side columns.
interface OverlapInfo {
  column: number;
  totalColumns: number;
}

const overlapLayout = computed(() => {
  const layout = new Map<string, OverlapInfo>();

  for (const day of days.value) {
    const dayStr = calendarDay(day);
    const dayStartMs = startOfDayUTC(dayStr, uiStore.displayTimezone);
    const dayEndMs = endOfDayUTC(dayStr, uiStore.displayTimezone);
    const dayStart = new Date(dayStartMs);
    const dayEnd = new Date(dayEndMs);

    const dayEvents: { id: string; key: string; start: number; end: number }[] = [];
    for (const e of calendarStore.visibleEvents) {
      const eStart = new Date(e.start_time);
      const eEnd = new Date(e.end_time);
      if (e.all_day || (eEnd.getTime() - eStart.getTime() > 24 * 60 * 60 * 1000)) continue;
      if (eStart > dayEnd || eEnd <= dayStart) continue;
      dayEvents.push({
        id: e.id,
        key: `${dayStr}:${e.id}`,
        start: Math.max(eStart.getTime(), dayStart.getTime()),
        end: Math.min(eEnd.getTime(), dayEnd.getTime() + 1),
      });
    }

    dayEvents.sort((a, b) => a.start - b.start || b.end - a.end);

    type ClusterEntry = { events: typeof dayEvents; end: number };
    const clusters: ClusterEntry[] = [];
    for (const ev of dayEvents) {
      let merged = false;
      for (const cluster of clusters) {
        if (ev.start < cluster.end) {
          cluster.events.push(ev);
          if (ev.end > cluster.end) cluster.end = ev.end;
          merged = true;
          break;
        }
      }
      if (!merged) {
        clusters.push({ events: [ev], end: ev.end });
      }
    }

    for (const cluster of clusters) {
      const columns: { end: number }[][] = [];
      for (const ev of cluster.events) {
        let placed = false;
        for (let col = 0; col < columns.length; col++) {
          const lastInCol = columns[col][columns[col].length - 1];
          if (lastInCol.end <= ev.start) {
            columns[col].push({ end: ev.end });
            layout.set(ev.key, { column: col, totalColumns: 0 });
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([{ end: ev.end }]);
          layout.set(ev.key, { column: columns.length - 1, totalColumns: 0 });
        }
      }

      const totalCols = columns.length;
      for (const ev of cluster.events) {
        const info = layout.get(ev.key);
        if (info) info.totalColumns = totalCols;
      }
    }
  }

  return layout;
});

function eventBlockStyle(seg: EventSegment): Record<string, string> {
  const startHour = getHourInTimezone(seg.segStart.toISOString(), uiStore.displayTimezone);
  const startMin = getMinutesInTimezone(seg.segStart.toISOString(), uiStore.displayTimezone);
  const topOffset = startHour * HOUR_HEIGHT + (startMin / 60) * HOUR_HEIGHT;

  const durationMs = seg.segEnd.getTime() - seg.segStart.getTime();
  const durationHours = Math.max(durationMs / (60 * 60 * 1000), 0.25);
  const height = durationHours * HOUR_HEIGHT;

  const dayStr = getDateInTimezone(seg.segStart.toISOString(), uiStore.displayTimezone);
  const ol = overlapLayout.value.get(`${dayStr}:${seg.event.id}`);
  const col = ol?.column ?? 0;
  const totalCols = ol?.totalColumns ?? 1;
  const widthPct = 100 / totalCols;
  const leftPct = col * widthPct;

  const style: Record<string, string> = {
    position: "absolute",
    top: `${topOffset}px`,
    height: `${height}px`,
    left: `calc(${leftPct}% + 1px)`,
    width: `calc(${widthPct}% - 2px)`,
    zIndex: "2",
    "--ev": getEventColor(seg.event),
  };

  Object.assign(style, getEventStyle(seg.event));
  return style;
}

function getAllDayEvents(date: Date) {
  const dayStr = calendarDay(date);
  return calendarStore.visibleEvents.filter((e) => {
    const eStart = new Date(e.start_time);
    const eEnd = new Date(e.end_time);
    const isMultiDay = eEnd.getTime() - eStart.getTime() > 24 * 60 * 60 * 1000;
    if (!e.all_day && !isMultiDay) return false;
    const startDate = e.start_time.split("T")[0];
    const endDate = e.end_time.split("T")[0];
    return startDate <= dayStr && endDate >= dayStr;
  });
}

function getEventColor(event: { calendar_id: string }): string {
  const cal = calendarStore.calendars.find((c) => c.id === event.calendar_id);
  return cal?.color || "#4285f4";
}

function getEventStyle(event: { my_status: string | null }): Record<string, string> {
  if (event.my_status === "declined") {
    return { opacity: "0.4", textDecoration: "line-through" };
  }
  if (event.my_status === "tentative") {
    return { borderLeftStyle: "dashed" };
  }
  return {};
}

// Derive a clamped hour from the pointer's vertical column offset.
function hourFromEvent(e: MouseEvent): number {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const y = e.clientY - rect.top;
  return Math.max(0, Math.min(23, Math.floor(y / HOUR_HEIGHT)));
}

function onColumnClick(date: Date, e: MouseEvent) {
  if (isCalendarDragging.value) return;
  const hour = hourFromEvent(e);
  const dt = new Date(date);
  dt.setHours(hour, 0, 0, 0);
  emit("timeClick", dt.toISOString());
}

const dragStartPos = ref<{ x: number; y: number } | null>(null);
const dragGhost = ref<HTMLElement | null>(null);
const dragOverCell = ref<{ day: string; hour: number } | null>(null);
const canDrop = computed(() => isCalendarDragging.value &&
  canDragCalendarEvent(dragCalendarEvent.value,
    calendarStore.getDisplayedEvent(dragCalendarEvent.value?.id ?? "")));
const DRAG_THRESHOLD = 5;
let dragCleanup: (() => void) | null = null;

function onEventMouseDown(event: MouseEvent, seg: EventSegment) {
  if (event.button !== 0) return;
  const ev = seg.event;

  if (ev.all_day || !canDragCalendarEvent(ev, calendarStore.getDisplayedEvent(ev.id))) return;

  dragStartPos.value = { x: event.clientX, y: event.clientY };
  const sourceEvent = ev;

  const handleMove = (e: MouseEvent) => {
    if (!dragStartPos.value) return;
    if (!canDragCalendarEvent(sourceEvent, calendarStore.getDisplayedEvent(sourceEvent.id))) return;
    const dx = e.clientX - dragStartPos.value.x;
    const dy = e.clientY - dragStartPos.value.y;
    if (!isCalendarDragging.value && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

    if (!isCalendarDragging.value) {
      dragCalendarEvent.value = sourceEvent;
      isCalendarDragging.value = true;
      const ghost = document.createElement("div");
      ghost.textContent = sourceEvent.title;
      ghost.dataset.testid = "cal-drag-ghost";
      ghost.style.cssText = "position:fixed;z-index:99999;padding:4px 10px;background:#3366cc;color:white;border-radius:4px;font-size:12px;font-weight:500;white-space:nowrap;pointer-events:none;";
      document.body.appendChild(ghost);
      dragGhost.value = ghost;
      document.body.style.cursor = "grabbing";
    }

    if (dragGhost.value) {
      dragGhost.value.style.left = e.clientX + 12 + "px";
      dragGhost.value.style.top = e.clientY + 12 + "px";
    }
  };

  const handleUp = () => {
    document.body.style.cursor = "";
    if (isCalendarDragging.value) {
      setTimeout(() => {
        isCalendarDragging.value = false;
        dragCalendarEvent.value = null;
        dragOverCell.value = null;
        if (dragGhost.value) {
          dragGhost.value.remove();
          dragGhost.value = null;
        }
      }, 0);
    }
    dragStartPos.value = null;
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("mouseup", handleUp);
    dragCleanup = null;
  };

  document.addEventListener("mousemove", handleMove);
  document.addEventListener("mouseup", handleUp);
  dragCleanup = handleUp;
}

function onColumnMove(day: Date, e: MouseEvent) {
  if (!canDrop.value) return;
  const hour = hourFromEvent(e);
  const dayStr = calendarDay(day);
  if (dragOverCell.value?.day !== dayStr || dragOverCell.value?.hour !== hour) {
    dragOverCell.value = { day: dayStr, hour };
  }
}

function onColumnLeave(day: Date) {
  const dayStr = calendarDay(day);
  if (dragOverCell.value?.day === dayStr) {
    dragOverCell.value = null;
  }
}

function dragHintVisible(day: Date): boolean {
  return canDrop.value &&
    dragOverCell.value?.day === calendarDay(day);
}

const dragHintStyle = computed(() => {
  if (!dragOverCell.value) return {};
  return {
    top: `${dragOverCell.value.hour * HOUR_HEIGHT}px`,
    height: `${HOUR_HEIGHT}px`,
  };
});

function onColumnDrop(day: Date, e: MouseEvent) {
  if (!canDrop.value || !dragCalendarEvent.value) return;
  const hour = hourFromEvent(e);
  dragOverCell.value = null;

  const ev = dragCalendarEvent.value;
  const originalStart = new Date(ev.start_time);
  const originalEnd = new Date(ev.end_time);
  const durationMs = originalEnd.getTime() - originalStart.getTime();

  const newStart = new Date(day);
  newStart.setHours(hour, 0, 0, 0);
  const newEnd = new Date(newStart.getTime() + durationMs);

  if (newStart.getTime() === originalStart.getTime()) return;

  emit("eventReschedule", {
    eventId: ev.id,
    newStart: newStart.toISOString(),
    newEnd: newEnd.toISOString(),
    attendeesJson: ev.attendees_json,
    organizerEmail: ev.organizer_email,
  });
}

// Keep the current-time marker centered and refreshed while mounted.
async function centerOnNow() {
  now.value = new Date();
  await nextTick();
  if (!gridRef.value) return;
  const hour = getHourInTimezone(now.value.toISOString(), uiStore.displayTimezone);
  const minutes = getMinutesInTimezone(now.value.toISOString(), uiStore.displayTimezone);
  const nowPx = (hour + minutes / 60) * HOUR_HEIGHT;
  gridRef.value.scrollTop = Math.max(0, nowPx - gridRef.value.clientHeight / 2);
}

onMounted(() => {
  scheduleNowTick();
  void centerOnNow();
});

// Cached view activation must refresh its scroll position.
onActivated(centerOnNow);

onUnmounted(() => {
  if (nowTimerId !== null) {
    clearTimeout(nowTimerId);
    nowTimerId = null;
  }
  if (dragCleanup) dragCleanup();
  if (allDayResizeCleanup) allDayResizeCleanup();
});
</script>

<template>
  <div
    class="week-view"
    :data-testid="singleDay ? 'cal-day-view' : 'cal-week-view'"
    :style="{ '--hour-height': `${HOUR_HEIGHT}px` }"
  >
    <div
      class="all-day-scroll"
      data-testid="cal-all-day-row"
      :style="{ maxHeight: `${allDayMaxHeight}px` }"
    >
      <div class="all-day-row">
        <div class="time-gutter all-day-label">{{ t("all-day") }}</div>
        <div
          v-for="day in days"
          :key="calendarDay(day) + 'ad'"
          class="all-day-cell"
          :class="{ today: isToday(day) }"
        >
          <div
            v-for="event in getAllDayEvents(day)"
            :key="event.id"
            class="all-day-event"
            :data-testid="`cal-event-${event.id}`"
            :style="{ '--ev': getEventColor(event), ...getEventStyle(event) }"
            @click="emit('eventClick', event.id)"
          >
            {{ event.title || t('(No title)') }}
          </div>
        </div>
      </div>
    </div>
    <div
      class="all-day-resizer"
      data-testid="cal-all-day-resizer"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="t('Resize all-day events')"
      @mousedown="onAllDayResizeStart"
    ></div>

    <div class="day-headers">
      <div class="time-gutter"></div>
      <div
        v-for="day in days"
        :key="calendarDay(day) + 'h'"
        class="day-header"
        :class="{ today: isToday(day), weekend: isWeekend(day) }"
      >
        <span class="day-name">{{ formatDayName(day) }}</span>
        <span class="day-num" :class="{ 'today-badge': isToday(day) }">{{ formatDayNum(day) }}</span>
      </div>
    </div>

    <div ref="gridRef" class="time-grid">
      <div class="time-gutter hour-labels">
        <div
          v-for="hour in hours"
          :key="hour"
          class="hour-label"
          :class="{ covered: hourLabelCovered(hour) }"
        >
          <span v-if="hour > 0">{{ formatHour(hour) }}</span>
        </div>
      </div>

      <div
        v-if="todayVisible"
        class="now-line"
        :style="{ top: nowMarkerTop }"
        data-testid="cal-now-line"
        aria-hidden="true"
      >
        <span class="now-time" data-testid="cal-now-time">{{ nowLabel }}</span>
      </div>

      <div
        v-for="day in days"
        :key="calendarDay(day)"
        class="day-column"
        :class="{ today: isToday(day), weekend: isWeekend(day) }"
        :data-testid="`cal-day-col-${calendarDay(day)}`"
        @click="onColumnClick(day, $event)"
        @mousemove="onColumnMove(day, $event)"
        @mouseleave="onColumnLeave(day)"
        @mouseup="onColumnDrop(day, $event)"
      >
        <div
          v-if="isToday(day)"
          class="now-marker"
          :style="{ top: nowMarkerTop }"
        ></div>

        <div
          v-if="dragHintVisible(day)"
          class="drag-hint"
          :style="dragHintStyle"
        ></div>

        <div
          v-for="seg in segmentsForDay(day)"
          :key="seg.event.id + '-' + seg.segStart.toISOString()"
          class="event-block"
          :class="{ dragging: isCalendarDragging && dragCalendarEvent?.id === seg.event.id }"
          :data-testid="`cal-event-${seg.event.id}`"
          :style="eventBlockStyle(seg)"
          @click.stop="emit('eventClick', seg.event.id)"
          @mousedown="onEventMouseDown($event, seg)"
        >
          <span class="event-title">{{ seg.event.title || t('(No title)') }}</span>
          <span class="event-time">
            {{ formatInTimezone(seg.segStart.toISOString(), uiStore.displayTimezone, { weekday: undefined, month: undefined, day: undefined, year: undefined, hour: 'numeric', minute: '2-digit', hour12: uiStore.hour12 }) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
}

/* Always-on 6px scrollbar keeps the columns aligned with the time grid. */
.all-day-scroll {
  flex-shrink: 0;
  overflow-y: scroll;
}

.all-day-scroll::-webkit-scrollbar {
  width: 8px;
}

.all-day-scroll::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}

.all-day-row {
  display: flex;
  min-height: 32px;
}

.all-day-resizer {
  flex-shrink: 0;
  height: 8px;
  border-bottom: 2px solid var(--color-border);
  cursor: row-resize;
  transition: border-color 0.1s;
}

.all-day-resizer:hover {
  border-bottom-color: var(--color-accent);
}

.all-day-label {
  font-size: 10px;
  color: var(--color-text-muted);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 8px 12px 0 0;
  text-transform: lowercase;
  letter-spacing: 0.3px;
}

/* min-width: 0 stops a long nowrap title from widening its day. */
.all-day-cell {
  flex: 1;
  min-width: 0;
  padding: 4px 2px;
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.all-day-cell.today {
  background: color-mix(in srgb, var(--color-accent) 5%, transparent);
}

/* Events: tinted surface + solid left bar in the calendar colour
   (--ev, set inline), matching the accent cards used in mail. */
.all-day-event {
  font-size: 11px;
  background: color-mix(in srgb, var(--ev) 20%, var(--color-bg));
  border-left: 3px solid var(--ev);
  color: color-mix(in srgb, var(--ev) 40%, var(--color-text));
  padding: 2px 8px;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.day-headers {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-bg);
  padding-right: 8px;
}

.day-header {
  flex: 1;
  text-align: center;
  padding: 8px 0 12px;
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.day-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.8px;
}

.day-header.today .day-name {
  color: var(--color-accent);
}

.day-header.weekend .day-name {
  color: var(--color-text-muted);
  opacity: 0.7;
}

.day-num {
  font-size: 20px;
  font-weight: 400;
  color: var(--color-text-secondary);
  line-height: 1;
}

.day-num.today-badge {
  background: var(--color-accent);
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  font-size: 18px;
}

.day-header.weekend .day-num {
  opacity: 0.6;
}

.time-gutter {
  width: 64px;
  flex-shrink: 0;
}

.hour-labels {
  display: flex;
  flex-direction: column;
}

.hour-label {
  /* Set from HOUR_HEIGHT so layout and hit-testing stay aligned. */
  height: var(--hour-height);
  font-size: 10px;
  color: var(--color-text-muted);
  padding: 0 12px 0 0;
  text-align: right;
  line-height: 1;
  position: relative;
  top: -8px;
}

.hour-label.covered span {
  visibility: hidden;
}

.time-grid {
  position: relative;
  flex: 1;
  overflow-y: scroll;
  display: flex;
  align-items: flex-start;
  min-height: 0;
}

.day-column {
  position: relative;
  flex: 1;
  align-self: stretch;
  height: calc(24 * var(--hour-height));
  border-left: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  cursor: pointer;
  background-color: var(--color-bg);
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--hour-height) - 1px),
    color-mix(in srgb, var(--color-border) 50%, transparent) calc(var(--hour-height) - 1px),
    color-mix(in srgb, var(--color-border) 50%, transparent) var(--hour-height)
  );
  transition: background-color 0.1s;
}

.day-column:hover {
  background-color: var(--color-bg-hover);
}

.day-column.today {
  background-color: color-mix(in srgb, var(--color-accent) 4%, var(--color-bg));
}

.day-column.today:hover {
  background-color: color-mix(in srgb, var(--color-accent) 8%, var(--color-bg));
}

.day-column.weekend {
  background-color: color-mix(in srgb, var(--color-bg-tertiary) 30%, transparent);
}

/* Faint line across every visible day; today's column gets the bold one. */
.now-line {
  position: absolute;
  left: 64px;
  right: 0;
  height: 0;
  border-top: 1px solid color-mix(in srgb, var(--color-danger) 45%, transparent);
  z-index: 5;
  pointer-events: none;
}

.now-time {
  position: absolute;
  right: 100%;
  top: 0;
  transform: translateY(-50%);
  margin-right: 4px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--color-danger);
  color: white;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.now-marker {
  position: absolute;
  left: -1px;
  right: 0;
  height: 2px;
  transform: translateY(-50%);
  background: var(--color-danger);
  z-index: 6;
  pointer-events: none;
}

.now-marker::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  background: var(--color-danger);
  border-radius: 50%;
}

.drag-hint {
  position: absolute;
  left: 0;
  right: 0;
  background: var(--color-accent-light);
  outline: 1px dashed var(--color-accent);
  outline-offset: -1px;
  pointer-events: none;
  z-index: 1;
}

.event-block {
  position: absolute;
  font-size: 11px;
  background: color-mix(in srgb, var(--ev) 20%, var(--color-bg));
  border-left: 3px solid var(--ev);
  color: color-mix(in srgb, var(--ev) 40%, var(--color-text));
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  line-height: 1.3;
  transition: box-shadow 0.15s, transform 0.1s;
  box-sizing: border-box;
}

.event-block:hover {
  background: color-mix(in srgb, var(--ev) 28%, var(--color-bg));
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.event-block.dragging {
  opacity: 0.4;
  pointer-events: none;
}

.event-time {
  font-size: 10px;
  opacity: 0.75;
  font-weight: 500;
}

.event-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.time-grid::-webkit-scrollbar {
  width: 8px;
}

.time-grid::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}
</style>
