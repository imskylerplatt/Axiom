import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";

/* ── Storage ── */
const STORAGE_KEY = "axiom_v3";

/* ── Types ── */
type Task = {
  id: number;
  text: string;
  date: string;
  priority: boolean;
  done: boolean;
};

type SortMode = "Priority" | "Date" | "Added";

/* ── Seed Data ── */
const INITIAL_TASKS: Task[] = [
  { id: 1, text: "Review project proposal", date: "2026-05-17", priority: true, done: false },
  { id: 2, text: "Finish quarterly design report", date: "2026-05-19", priority: true, done: false },
  { id: 3, text: "Refine design typography tokens", date: "2026-05-18", priority: false, done: false },
  { id: 4, text: "Schedule team standup", date: "2026-05-21", priority: false, done: false },
  { id: 5, text: "Audit layout contrast ratios", date: "", priority: false, done: true },
];

/* ── Colors ── */
const COLORS = {
  bg: "#F0F0F0",
  surface: "#F8F8F8",
  card: "#FFFFFF",
  border: "#F0F0F0",
  divider: "#ECECEC",
  text: "#000000",
  muted: "#757575",
  faint: "#BBBBBB",
  red: "#FF3B30",
  green: "#34C759",
  yellow: "#FFCC00",
  yellowBg: "#FFFBEE",
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_DEL = 120;
const SWIPE_DONE = 120;

/* ── Date formatter ── */
const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const tom = new Date(t);
  tom.setDate(t.getDate() + 1);
  if (d.getTime() === t.getTime()) return "Today";
  if (d.getTime() === tom.getTime()) return "Tmrw";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const toIso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/* ══════════════════════════════
   Icons
══════════════════════════════ */
const CalIcon = () => (
  <Svg width="12" height="12" viewBox="0 0 14 14" fill="none">
    <Rect x="1" y="2.5" width="12" height="10.5" rx="2.5" stroke="#757575" strokeWidth="1.3" />
    <Path d="M1 6h12" stroke="#757575" strokeWidth="1.3" />
    <Path d="M4.5 1v3M9.5 1v3" stroke="#757575" strokeWidth="1.3" strokeLinecap="round" />
  </Svg>
);

const StarIcon = ({ filled, size = 17 }: { filled: boolean; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill={filled ? "#000000" : "none"}>
    <Path
      d="M10 2l2.39 4.84 5.34.78-3.86 3.76.91 5.32L10 14.27l-4.78 2.43.91-5.32L2.27 7.62l5.34-.78L10 2z"
      stroke={filled ? "#000000" : "#C8C8C8"}
      strokeWidth="1.6"
    />
  </Svg>
);

const CheckSm = ({ color = "#FFFFFF", size = 13 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Path d="M2 7l3.2 3.2L12 3.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const TrashIcon = ({ size = 16, color = "#757575" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </Svg>
);

const PlusIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

const CheckLg = () => (
  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
    <Path d="M4 12l5 5L20 6" />
  </Svg>
);

/* ══════════════════════════════
   SwipeableTask
══════════════════════════════ */
type SwipeableTaskProps = {
  task: Task;
  isActive: boolean;
  onToggleDone: (id: number) => void;
  onToggleStar: (id: number) => void;
  onDelete: (id: number) => void;
  onTextEdit: (id: number, text: string) => void;
  onOpenDate: (id: number) => void;
  drag: () => void;
};

function SwipeableTask({
  task, isActive, onToggleDone, onToggleStar, onDelete, onTextEdit, onOpenDate, drag,
}: SwipeableTaskProps) {
  const swipeX = useRef(new Animated.Value(0)).current;
  const [committed, setCommitted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStarted = useRef(false);

  useEffect(() => setEditText(task.text), [task.text]);

  const resetSwipe = () => {
    Animated.spring(swipeX, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
  };

  const triggerDelete = () => {
    setCommitted(true);
    Animated.timing(swipeX, { toValue: -SCREEN_WIDTH, duration: 230, useNativeDriver: false }).start(() => {
      onDelete(task.id);
    });
  };

  const triggerDone = () => {
    setCommitted(true);
    Animated.timing(swipeX, { toValue: SCREEN_WIDTH, duration: 230, useNativeDriver: false }).start(() => {
      onToggleDone(task.id);
      setCommitted(false);
      swipeX.setValue(0);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 10,
      onPanResponderGrant: () => {
        dragStarted.current = false;
        longPressTimer.current = setTimeout(() => {
          dragStarted.current = true;
          drag();
        }, 480);
      },
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
        }
        if (dragStarted.current) return;
        swipeX.setValue(g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        if (dragStarted.current) {
          dragStarted.current = false;
          return;
        }
        if (g.dx < -SWIPE_DEL) triggerDelete();
        else if (g.dx > SWIPE_DONE) triggerDone();
        else resetSwipe();
      },
      onPanResponderTerminate: () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        resetSwipe();
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const underlayLeft = swipeX.interpolate({
    inputRange: [-SWIPE_DEL, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const underlayRight = swipeX.interpolate({
    inputRange: [0, SWIPE_DONE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const submitEdit = () => {
    if (editText.trim()) onTextEdit(task.id, editText.trim());
    setIsEditing(false);
  };

  return (
    <View style={styles.taskWrapper}>
      {/* Underlay: Delete */}
      <Animated.View style={[styles.underlay, styles.underlayDel, { opacity: underlayLeft }]}>
        <TrashIcon size={22} color="#FFFFFF" />
      </Animated.View>
      {/* Underlay: Done */}
      <Animated.View style={[styles.underlay, styles.underlayDone, { opacity: underlayRight }]}>
        <CheckLg />
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.iceCube,
          task.done && styles.iceCubeDone,
          task.priority && !task.done && styles.iceCubePriority,
          {
            transform: [{ translateX: swipeX }, { scale: isActive ? 1.02 : 1 }],
            opacity: isActive ? 0.4 : task.done ? 0.6 : 1,
            shadowOpacity: isActive ? 0.07 : task.done ? 0 : 0.03,
          },
        ]}
      >
        {/* Checkbox */}
        <TouchableOpacity
          style={[styles.checkbox, task.done && styles.checkboxChecked]}
          onPress={() => onToggleDone(task.id)}
        >
          {task.done && <CheckSm />}
        </TouchableOpacity>

        {/* Text */}
        <View style={styles.taskTextWrap}>
          {isEditing ? (
            <TextInput
              autoFocus
              value={editText}
              onChangeText={setEditText}
              onBlur={submitEdit}
              onSubmitEditing={submitEdit}
              style={styles.taskTextInput}
            />
          ) : (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text
                style={[styles.taskText, task.done && styles.taskTextDone]}
                numberOfLines={1}
              >
                {task.text}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Date Badge */}
        <TouchableOpacity
          style={[styles.dateBadge, task.date && styles.dateBadgeHasDate]}
          onPress={() => onOpenDate(task.id)}
        >
          <CalIcon />
          <Text style={[styles.dateBadgeText, task.date && styles.dateBadgeTextActive]}>
            {task.date ? fmtDate(task.date) : "Date"}
          </Text>
        </TouchableOpacity>

        {/* Star */}
        <TouchableOpacity style={styles.starBtn} onPress={() => onToggleStar(task.id)}>
          <StarIcon filled={task.priority} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

/* ══════════════════════════════
   Today Screen
══════════════════════════════ */
export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState<SortMode>("Priority");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newPriority, setNewPriority] = useState(false);
  const [showNewDatePicker, setShowNewDatePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [datePickerTaskId, setDatePickerTaskId] = useState<number | null>(null);

  /* Load persisted tasks */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setTasks(JSON.parse(raw));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  /* Persist tasks */
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)).catch(() => {});
  }, [tasks, loaded]);

  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const pendingCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.filter((t) => t.done).length;

  const sortFn = useCallback(
    (a: Task, b: Task) => {
      if (sort === "Priority") return (b.priority ? 1 : 0) - (a.priority ? 1 : 0);
      if (sort === "Date") return (a.date || "zzz").localeCompare(b.date || "zzz");
      return 0;
    },
    [sort]
  );

  const pendingTasks = [...tasks].filter((t) => !t.done).sort(sortFn);
  const doneTasks = [...tasks].filter((t) => t.done).sort(sortFn);

  const toggleDone = (id: number) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done, priority: t.done ? t.priority : false } : t))
    );

  const toggleStar = (id: number) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, priority: !t.priority } : t)));

  const editTaskText = (id: number, text: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));

  const setTaskDate = (id: number, date: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, date } : t)));

  const deleteTask = (id: number) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const clearAll = () => {
    setTasks([]);
    setShowDeleteConfirm(false);
  };

  const addTask = () => {
    if (!newText.trim()) return;
    setTasks((prev) => [
      { id: Date.now(), text: newText.trim(), date: newDate || "", priority: newPriority, done: false },
      ...prev,
    ]);
    setNewText("");
    setNewDate("");
    setNewPriority(false);
    setShowAddModal(false);
  };

  const onDragEnd = useCallback(
    ({ data }: { data: Task[] }) => {
      setTasks((prev) => {
        const doneItems = prev.filter((t) => t.done);
        return [...data, ...doneItems];
      });
    },
    []
  );

  const datePickerTask = tasks.find((t) => t.id === datePickerTaskId) || null;

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Task>) => (
    <ScaleDecorator activeScale={1.02}>
      <SwipeableTask
        task={item}
        isActive={isActive}
        onToggleDone={toggleDone}
        onToggleStar={toggleStar}
        onDelete={deleteTask}
        onTextEdit={editTaskText}
        onOpenDate={setDatePickerTaskId}
        drag={drag}
      />
    </ScaleDecorator>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerWordmark}>Axiom</Text>
          <Text style={styles.headerMeta}>
            {dayName.toUpperCase()}{"\n"}{dateStr.toUpperCase()}
          </Text>
        </View>

        {/* Sort + Action Bar */}
        <View style={styles.sortBar}>
          {(["Priority", "Date", "Added"] as SortMode[]).map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.sortChip, sort === opt && styles.sortChipActive]}
              onPress={() => setSort(opt)}
            >
              <Text style={[styles.sortChipText, sort === opt && styles.sortChipTextActive]}>
                {opt.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowDeleteConfirm(true)}>
            <TrashIcon size={15} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── TASK FEED ── */}
      {pendingTasks.length === 0 && doneTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C8C8C8" strokeWidth="2" strokeLinecap="round">
              <Path d="M9 11l3 3L22 4" />
              <Path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </Svg>
          </View>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptySub}>Tap + to add your first task</Text>
        </View>
      ) : (
        <DraggableFlatList
          data={pendingTasks}
          onDragEnd={onDragEnd}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.taskFeed}
          ListFooterComponent={
            doneTasks.length > 0 ? (
              <View>
                <Text style={styles.sectionLabel}>Completed · {doneTasks.length}</Text>
                {doneTasks.map((item) => (
                  <View key={item.id} style={{ marginBottom: 10 }}>
                    <SwipeableTask
                      task={item}
                      isActive={false}
                      onToggleDone={toggleDone}
                      onToggleStar={toggleStar}
                      onDelete={deleteTask}
                      onTextEdit={editTaskText}
                      onOpenDate={setDatePickerTaskId}
                      drag={() => {}}
                    />
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}

      {/* ── FAB ── */}
      {!showAddModal && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 28 + insets.bottom }]}
          onPress={() => setShowAddModal(true)}
        >
          <PlusIcon />
        </TouchableOpacity>
      )}

      {/* ── FOOTER ── */}
      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]} pointerEvents="none">
        <View style={styles.footerInner}>
          <Text style={styles.footerStat}>{pendingCount} PENDING</Text>
          <Text style={styles.footerStat}>{doneCount} DONE</Text>
        </View>
      </View>

      {/* ── ADD TASK MODAL ── */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalCenterWrap}
          pointerEvents="box-none"
        >
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>New Task</Text>
            <TextInput
              autoFocus
              value={newText}
              onChangeText={setNewText}
              onSubmitEditing={addTask}
              placeholder="What needs to be done?"
              placeholderTextColor="#757575"
              style={styles.modalInput}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalDateBox} onPress={() => setShowNewDatePicker(true)}>
                <CalIcon />
                <Text style={[styles.modalDateText, { color: newDate ? "#000000" : "#757575" }]}>
                  {newDate ? fmtDate(newDate) || newDate : "Add date"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalStarBtn, newPriority && styles.modalStarBtnActive]}
                onPress={() => setNewPriority(!newPriority)}
              >
                <StarIcon filled={newPriority} size={18} />
              </TouchableOpacity>
            </View>
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={styles.btnPrimary} onPress={addTask}>
                <Text style={styles.btnPrimaryText}>Add Task</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setShowAddModal(false)}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New task date picker */}
      {showNewDatePicker && (
        <DateTimePicker
          value={newDate ? new Date(newDate + "T00:00:00") : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(_e, selected) => {
            setShowNewDatePicker(false);
            if (selected) setNewDate(toIso(selected));
          }}
        />
      )}

      {/* ── PER-TASK DATE PICKER ── */}
      <Modal visible={!!datePickerTask} transparent animationType="fade" onRequestClose={() => setDatePickerTaskId(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDatePickerTaskId(null)} />
        <View style={styles.modalCenterWrap} pointerEvents="box-none">
          <View style={styles.dateDropdown}>
            <Text style={styles.dateDropdownLabel}>DUE DATE</Text>
            <DateTimePicker
              value={datePickerTask?.date ? new Date(datePickerTask.date + "T00:00:00") : new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(_e, selected) => {
                if (selected && datePickerTaskId != null) {
                  setTaskDate(datePickerTaskId, toIso(selected));
                  if (Platform.OS === "android") setDatePickerTaskId(null);
                }
              }}
            />
            {datePickerTask?.date && (
              <TouchableOpacity
                style={styles.dateClearBtn}
                onPress={() => {
                  if (datePickerTaskId != null) setTaskDate(datePickerTaskId, "");
                  setDatePickerTaskId(null);
                }}
              >
                <Text style={styles.dateClearBtnText}>CLEAR DATE</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── CLEAR ALL CONFIRM ── */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeleteConfirm(false)} />
        <View style={styles.modalCenterWrap} pointerEvents="box-none">
          <View style={[styles.modalPanel, { alignItems: "center", maxWidth: 320 }]}>
            <View style={styles.confirmIconWrap}>
              <TrashIcon size={22} color="#FF3B30" />
            </View>
            <Text style={[styles.modalTitle, { textAlign: "center" }]}>Empty entire list?</Text>
            <Text style={styles.confirmBody}>
              All tasks and completed records will be permanently deleted.
            </Text>
            <View style={{ width: "100%", gap: 8 }}>
              <TouchableOpacity style={styles.btnDanger} onPress={clearAll}>
                <Text style={styles.btnPrimaryText}>Yes, Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={[styles.btnGhostText, { color: "#000000" }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ══════════════════════════════
   Styles
══════════════════════════════ */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },

  /* Header */
  header: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 8,
  },
  headerWordmark: {
    fontSize: 30,
    fontFamily: "DMSans_700Bold",
    color: COLORS.text,
    letterSpacing: -1.2,
  },
  headerMeta: {
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
    color: COLORS.muted,
    letterSpacing: 0.8,
    textAlign: "right",
    lineHeight: 14,
  },

  /* Sort bar */
  sortBar: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 14,
  },
  sortChip: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  sortChipActive: {
    borderColor: "#000000",
    backgroundColor: "#000000",
  },
  sortChipText: {
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 1,
    color: COLORS.muted,
  },
  sortChipTextActive: {
    color: COLORS.card,
  },
  iconBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Task feed */
  taskFeed: {
    padding: 16,
    paddingBottom: 140,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 1.4,
    color: COLORS.faint,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 2,
    textTransform: "uppercase",
  },

  /* Task wrapper / underlays */
  taskWrapper: {
    position: "relative",
    borderRadius: 20,
    marginBottom: 10,
  },
  underlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  underlayDel: {
    backgroundColor: COLORS.red,
    justifyContent: "flex-end",
    paddingRight: 20,
  },
  underlayDone: {
    backgroundColor: COLORS.green,
    justifyContent: "flex-start",
    paddingLeft: 20,
  },

  /* Ice cube card */
  iceCube: {
    position: "relative",
    borderRadius: 20,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 1,
  },
  iceCubeDone: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    elevation: 0,
  },
  iceCubePriority: {
    borderLeftWidth: 4,
    borderLeftColor: "#000000",
  },

  /* Checkbox */
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },

  /* Task text */
  taskTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  taskText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: COLORS.text,
    letterSpacing: -0.15,
  },
  taskTextDone: {
    color: COLORS.muted,
    textDecorationLine: "line-through",
  },
  taskTextInput: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: COLORS.text,
    letterSpacing: -0.15,
    padding: 0,
  },

  /* Date badge */
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.divider,
    flexShrink: 0,
  },
  dateBadgeHasDate: {
    backgroundColor: COLORS.card,
  },
  dateBadgeText: {
    fontSize: 9,
    fontFamily: "DMSans_700Bold",
    color: COLORS.muted,
    letterSpacing: 0.2,
  },
  dateBadgeTextActive: {
    fontSize: 10,
    color: COLORS.text,
  },

  /* Star */
  starBtn: {
    padding: 2,
    flexShrink: 0,
  },

  /* FAB */
  fab: {
    position: "absolute",
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 6,
  },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  footerInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerStat: {
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
    color: COLORS.faint,
    letterSpacing: 0.8,
  },

  /* Empty state */
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 60,
    gap: 10,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "DMSans_700Bold",
    color: COLORS.text,
    letterSpacing: -0.15,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: COLORS.muted,
  },

  /* Modal */
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  modalCenterWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPanel: {
    width: "90%",
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.08,
    shadowRadius: 60,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "DMSans_700Bold",
    color: COLORS.text,
    letterSpacing: -0.34,
    marginBottom: 20,
  },
  modalInput: {
    fontSize: 15,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    paddingVertical: 10,
    marginBottom: 18,
    fontFamily: "DMSans_500Medium",
    color: COLORS.text,
  },
  modalRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 28,
  },
  modalDateBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
  },
  modalDateText: {
    fontSize: 12,
    fontFamily: "DMSans_700Bold",
  },
  modalStarBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalStarBtnActive: {
    backgroundColor: COLORS.yellowBg,
    borderColor: COLORS.yellow,
  },

  /* Buttons */
  btnPrimary: {
    width: "100%",
    backgroundColor: "#000000",
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
  },
  btnPrimaryText: {
    color: COLORS.card,
    fontSize: 14,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 0.2,
  },
  btnGhost: {
    width: "100%",
    paddingVertical: 10,
    alignItems: "center",
  },
  btnGhostText: {
    color: COLORS.muted,
    fontSize: 13,
    fontFamily: "DMSans_700Bold",
  },
  btnDanger: {
    width: "100%",
    backgroundColor: COLORS.red,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  /* Date dropdown */
  dateDropdown: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
    minWidth: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.09,
    shadowRadius: 48,
  },
  dateDropdownLabel: {
    fontSize: 9,
    fontFamily: "DMSans_700Bold",
    color: COLORS.muted,
    marginBottom: 10,
    letterSpacing: 1.4,
  },
  dateClearBtn: {
    marginTop: 10,
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: "center",
  },
  dateClearBtnText: {
    fontSize: 11,
    fontFamily: "DMSans_700Bold",
    color: COLORS.text,
    letterSpacing: 0.6,
  },

  /* Confirm dialog */
  confirmIconWrap: {
    width: 52,
    height: 52,
    backgroundColor: "#FFF1F0",
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  confirmBody: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 24,
    lineHeight: 20,
    fontFamily: "DMSans_500Medium",
    textAlign: "center",
  },
});
