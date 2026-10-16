import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, useColorScheme, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { getTheme } from '@/theme';
import { previewArchiveDelete } from '@/db/queries';
import { confirmDeleteArchive, archiveDeleteErrorMessage } from '@/utils/archiveDelete';
import FilterChips from '@/components/FilterChips';
import ProgressBar from '@/components/ProgressBar';
import PalletRow from '@/components/PalletRow';
import ArchiveCard from '@/components/ArchiveCard';
import PalletEditSheet, { palletErrorMessage } from '@/components/PalletEditSheet';
import ContainerEditSheet from '@/components/ContainerEditSheet';
import FinishOrderModal from '@/components/FinishOrderModal';
import PackStatusModal from '@/components/PackStatusModal';
import { checkPalletStatus, isPalletMatchingStatus } from '@/utils/packStatus';

export default function ContainersScreen() {
  const theme = getTheme(useColorScheme());
  const {
    items, poRows, togglePalletLine, finishOrder, archives, finishing, init,
    activeContainerFilter, setContainerFilter, containerData,
    addPallet, updatePallet, removePallet, deleteArchive, archivesBusy,
    updateContainer, removeContainer, addContainer,
    updatePalletLinePackStatus, togglePalletLineLabel, togglePallet,
  } = useAppStore();
  const [packModalTarget, setPackModalTarget] = useState(null); // { item, palletNo }
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatusFilter, setActiveStatusFilter] = useState('all'); // 'all' | 'unlabeled' | 'incomplete' | 'both'
  const [expandedIds, setExpandedIds] = useState(new Set());
  // FEAT-15 (AC-ARCH-01/03): trạng thái mở nội dung của các thẻ đơn lưu trữ.
  // Mặc định mọi thẻ đều thu gọn (ẩn nội dung).
  // State cục bộ, không lưu (`§0.2` #9) ⇒ mở app lại thì về mặc định thu gọn.
  const [archivesOpen, setArchivesOpen] = useState({});
  const [showArchivesSection, setShowArchivesSection] = useState(true);

  const isAnyArchiveOpen = useMemo(() => {
    return (archives || []).some(a => !!archivesOpen[a.id]);
  }, [archives, archivesOpen]);
  // FEAT-10: form thêm/sửa kiện. `draftPallet` = null ⇒ đang thêm mới.
  const [draft, setDraft] = useState(null); // { containerId, label, po, pallet, nextNo }
  // FEAT-25: form thêm/sửa container. `containerDraft` = null ⇒ đang đóng.
  const [containerDraft, setContainerDraft] = useState(null); // { isAdd, container }
  // FEAT-21: `containerData` là cây từ bảng thật (`containers` → `pallets` → `pallet_lines`),
  // không phải blob JSON, và luôn là mảng ⇒ không còn fallback seed.
  const containers = containerData;
  // FEAT-23 §sort: danh sách PO **tăng dần** theo số (`'2919'` < `'2920'` < `'2929'`).
  // Thu thập mọi PO có trong container và kiện để hỗ trợ container chứa nhiều PO.
  const cpos = useMemo(() => {
    const set = new Set();
    (containers || []).forEach(c => {
      if (c.po) set.add(c.po);
      (c.pallets || []).forEach(p => {
        (p.items || []).forEach(it => {
          if (it.po) set.add(it.po);
        });
      });
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }, [containers]);

  // Thống kê nhanh tổng quan các kiện có vấn đề (để hiển thị lên 3 nút đếm ở đầu trang)
  const statusSummary = useMemo(() => {
    let unlabeledCount = 0;
    let incompleteCount = 0;
    let bothCount = 0;
    let totalPallets = 0;

    (containers || []).forEach(c => {
      const matchPo = activeContainerFilter === 'all'
        ? true
        : (c.po === activeContainerFilter || (c.pallets || []).some(p => (p.items || []).some(it => it.po === activeContainerFilter)));
      if (!matchPo) return;

      (c.pallets || []).forEach(p => {
        const matchPalletPo = activeContainerFilter === 'all'
          ? true
          : (p.items || []).some(it => it.po === activeContainerFilter);
        if (!matchPalletPo) return;

        totalPallets++;
        const { hasUnlabeled, hasIncomplete, hasBoth } = checkPalletStatus(p);
        if (hasUnlabeled) unlabeledCount++;
        if (hasIncomplete) incompleteCount++;
        if (hasBoth) bothCount++;
      });
    });

    return {
      unlabeledCount,
      incompleteCount,
      bothCount,
      totalPallets,
    };
  }, [containers, activeContainerFilter]);

  const isFilteringStatus = activeStatusFilter !== 'all';
  const isSearching = Boolean(searchQuery.trim());
  const isAutoExpanded = isSearching || isFilteringStatus;

  const currentFilterMeta = useMemo(() => {
    if (activeStatusFilter === 'unlabeled') {
      return { key: 'unlabeled', label: 'Chưa dán nhãn', color: theme.bad, icon: 'pricetag' };
    }
    if (activeStatusFilter === 'incomplete') {
      return { key: 'incomplete', label: 'Chưa đủ số lượng', color: theme.warn, icon: 'hourglass' };
    }
    if (activeStatusFilter === 'both') {
      return { key: 'both', label: 'Bị cả 2 (Thiếu SL & Chưa dán nhãn)', color: '#dc2626', icon: 'alert-circle' };
    }
    return { key: 'all', label: 'Tất cả', color: theme.accent, icon: 'cube' };
  }, [activeStatusFilter, theme]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return (containers || []).map(c => {
      // 1. Lọc PO của container
      const matchPo = activeContainerFilter === 'all'
        ? true
        : (c.po === activeContainerFilter || (c.pallets || []).some(p => (p.items || []).some(it => it.po === activeContainerFilter)));
      if (!matchPo) return null;

      const sortedPallets = (c.pallets ?? []).sort(
        (a, b) => (a.pallet_no ?? a.no) - (b.pallet_no ?? b.no)
      );

      // 2. Lọc các kiện bên trong container theo PO, StatusFilter và SearchQuery (Phương án A)
      const matchingPallets = sortedPallets.filter(p => {
        // Lọc PO kiện
        if (activeContainerFilter !== 'all') {
          const matchPalletPo = (p.items || []).some(it => it.po === activeContainerFilter);
          if (!matchPalletPo) return false;
        }

        // Lọc theo trạng thái kiện (chưa dán nhãn / chưa đủ SL / cả hai)
        if (!isPalletMatchingStatus(p, activeStatusFilter)) {
          return false;
        }

        // Lọc theo từ khoá tìm kiếm
        if (q) {
          const matchSearch = (p.items || []).some(it =>
            String(it.ntk || '').toLowerCase().includes(q) ||
            String(it.order_ref || '').toLowerCase().includes(q)
          );
          if (!matchSearch) return false;
        }

        return true;
      });

      // Nếu đang lọc (bởi trạng thái hoặc tìm kiếm): container phải có ít nhất 1 kiện thoả mãn mới hiển thị
      if ((isFilteringStatus || q) && matchingPallets.length === 0) {
        return null;
      }

      return {
        ...c,
        sortedPallets,
        // Phương án A: Khi lọc trạng thái, chỉ hiển thị các kiện khớp (ẩn các kiện đã hoàn thành đầy đủ)
        visiblePallets: isFilteringStatus ? matchingPallets : sortedPallets,
        matchingSearchPallets: q ? matchingPallets : [],
        isMatchedByStatus: isFilteringStatus && matchingPallets.length > 0,
        isMatchedBySearch: isSearching && matchingPallets.length > 0,
        matchingPallets,
      };
    }).filter(Boolean);
  }, [containers, activeContainerFilter, activeStatusFilter, searchQuery, isFilteringStatus, isSearching]);

  // Tổng số kiện hiển thị theo bộ lọc
  const filteredPalletCount = useMemo(() => {
    return filtered.reduce((sum, c) => sum + (c.visiblePallets || []).length, 0);
  }, [filtered]);

  // Một kiện "đóng xong" khi **mọi** dòng hàng của nó đã tick. Với kiện một mã (thực tế
  // `Dmac.json` có 220/220 kiện một mã) đây đúng là tick của cả kiện — trước đây cần khoá
  // riêng cho hai trường hợp, nay một quy tắc cho cả hai.
  const palletDone = (p) => p.items.length > 0 && p.items.every(it => it.done);
  const allPallets = containers.flatMap(c => c.pallets);
  const done = allPallets.filter(palletDone).length;
  const total = allPallets.length;
  const itemNtks = items.map(it => it.ntk);
  const knownNtks = new Set(itemNtks);

  function toggleExpand(id) {
    const next = new Set(expandedIds);
    if (isAutoExpanded) {
      const key = `closed_${id}`;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
    } else {
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
    }
    setExpandedIds(next);
  }

  function openAddPallet(c, containerPos) {
    const nextNo = (c.pallets || []).reduce((m, p) => Math.max(m, p.pallet_no ?? p.no), 0) + 1;
    setDraft({ containerId: c.id, label: c.container_no, po: c.po, pos: containerPos, pallet: null, nextNo });
  }

  function openEditPallet(c, pallet, containerPos) {
    setDraft({ containerId: c.id, label: c.container_no, po: c.po, pos: containerPos, pallet, nextNo: null });
  }

  function confirmDeletePallet(c, pallet) {
    const palletNo = pallet.pallet_no ?? pallet.no;
    const qty = (pallet.items || []).reduce((s, it) => s + it.qty, 0);
    Alert.alert(
      'Xác nhận xoá kiện',
      `Xoá kiện ${palletNo} khỏi container ${c.container_no}?\nTổng số lượng: ${qty.toLocaleString('vi-VN')} pcs. Không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá kiện',
          style: 'destructive',
          onPress: async () => {
            const res = await removePallet(c.id, palletNo);
            if (res && res.ok === false) {
              Alert.alert('Không xoá được', palletErrorMessage(res.error));
            }
          },
        },
      ]
    );
  }

  // FEAT-25: mở form sửa thông tin container (tên/mã container, số chì seal)
  function openEditContainer(c) {
    setContainerDraft({ isAdd: false, container: c });
  }

  // FEAT-25: mở form thêm container mới
  function openAddContainer() {
    setContainerDraft({ isAdd: true, container: null });
  }

  // FEAT-25: danh sách PO có sẵn để chọn khi tạo container mới
  const poOptionsForContainer = useMemo(() => {
    const fromPoRows = (poRows || []).map(r => r.po || r.key || r.label).filter(Boolean);
    const set = new Set([...cpos, ...fromPoRows]);
    return Array.from(set).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }, [cpos, poRows]);

  // Danh sách mã hàng khả dụng cho kiện đang thêm / sửa (lọc theo các PO của container)
  const draftItemOptions = useMemo(() => {
    if (!draft) return [];
    const targetPos = draft.pos && draft.pos.length > 0 ? new Set(draft.pos) : (draft.po ? new Set([draft.po]) : null);
    const poItems = targetPos ? items.filter(it => targetPos.has(it.po)) : items;
    const baseItems = poItems.length > 0 ? poItems : items;
    const map = new Map();
    baseItems.forEach(it => {
      const key = it.order_line_id ? String(it.order_line_id) : `${it.po || ''}_${it.ntk}`;
      if (it.ntk && !map.has(key)) {
        map.set(key, { ntk: it.ntk, target: it.target, order_line_id: it.order_line_id, po: it.po });
      }
    });
    if (draft.pallet?.items) {
      draft.pallet.items.forEach(it => {
        const key = it.order_line_id ? String(it.order_line_id) : `${it.po || ''}_${it.ntk}`;
        if (it.ntk && !map.has(key)) {
          map.set(key, { ntk: it.ntk, target: 0, order_line_id: it.order_line_id, po: it.po });
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.po && b.po && a.po !== b.po) {
        return Number(a.po) - Number(b.po) || a.po.localeCompare(b.po);
      }
      return a.ntk.localeCompare(b.ntk);
    });
  }, [items, draft]);


  // FEAT-15 (AC-ARCH-03): thu gọn / mở nội dung của TẤT CẢ thẻ lưu trữ
  function toggleAllArchives() {
    if (isAnyArchiveOpen) {
      setArchivesOpen({});
    } else {
      const next = {};
      (archives || []).forEach(a => {
        next[a.id] = true;
      });
      setArchivesOpen(next);
    }
  }

  // FEAT-15 (AC-ARCH-03): chạm mũi tên trên từng thẻ đơn lưu trữ để mở/đóng chi tiết
  function toggleArchive(id) {
    setArchivesOpen(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // FEAT-15: đường DUY NHẤT tới `deleteArchive` — qua `Alert` xác nhận (INV-U1).
  async function runDeleteArchive(batchId) {
    if (archivesBusy) return;
    const preview = await previewArchiveDelete(batchId);
    if (!preview.ok) {
      Alert.alert('Không xoá được', archiveDeleteErrorMessage(preview.error));
      init();
      return;
    }
    confirmDeleteArchive({ preview, onDelete: deleteArchive, alert: Alert });
  }

  const [showFinishModal, setShowFinishModal] = useState(false);

  // FEAT-24: Thống kê danh sách PO cho chức năng hoàn tất theo PO
  const poListForFinish = useMemo(() => {
    const map = new Map();

    (poRows || []).forEach(r => {
      const code = r?.po || r?.key || r?.label;
      if (!code) return;
      const codeStr = String(code);
      map.set(codeStr, {
        code: codeStr,
        target: Number(r?.target) || 0,
        produced: Number(r?.produced) || 0,
        defect: Number(r?.defect) || 0,
        palletsTotal: 0,
        palletsDone: 0,
      });
    });

    (containers || []).forEach(c => {
      (c?.pallets || []).forEach(p => {
        const palletPos = new Set((p?.items || []).map(it => it.po).filter(Boolean));
        if (palletPos.size === 0 && c?.po) {
          palletPos.add(c.po);
        }
        palletPos.forEach(poCode => {
          const codeStr = String(poCode);
          if (!map.has(codeStr)) {
            map.set(codeStr, {
              code: codeStr,
              target: 0,
              produced: 0,
              defect: 0,
              palletsTotal: 0,
              palletsDone: 0,
            });
          }
          const entry = map.get(codeStr);
          entry.palletsTotal += 1;
          if (palletDone(p)) {
            entry.palletsDone += 1;
          }
        });
      });
    });

    return Array.from(map.values())
      .filter(p => Boolean(p.code))
      .sort((a, b) => {
        const numA = Number(a.code);
        const numB = Number(b.code);
        if (Number.isFinite(numA) && Number.isFinite(numB)) {
          return numA - numB;
        }
        return String(a.code).localeCompare(String(b.code));
      });
  }, [poRows, containers]);

  function handleFinish() {
    if (finishing) return;
    if (poListForFinish.length === 0) {
      Alert.alert(
        'Hoàn tất đơn hàng',
        'Đơn hàng hiện tại không có mã PO nào. Bạn có muốn dọn màn hình để bắt đầu đơn mới?',
        [
          { text: 'Huỷ', style: 'cancel' },
          { text: 'Xác nhận', onPress: () => runFinish(null) },
        ]
      );
      return;
    }
    setShowFinishModal(true);
  }

  async function runFinish(selectedCodes) {
    try {
      const res = await finishOrder(selectedCodes);
      // BUSY = có lần hoàn tất khác đang chạy (chặn INV-B1) ⇒ coi như đã bỏ qua.
      if (res && res.ok === false && res.error?.code !== 'BUSY') {
        Alert.alert('Không hoàn tất được', 'Đơn hàng hiện tại đã được hoàn tất trước đó. Màn hình sẽ được tải lại.');
        init();
        return;
      }
      setShowFinishModal(false);
      if (res?.partial) {
        Alert.alert(
          'Đã lưu trữ',
          `Đã hoàn tất và lưu trữ thành công ${(res.completedPos || []).length} mã PO: ${(res.completedPos || []).join(', ')}.\nCác PO còn lại vẫn tiếp tục được sản xuất trên màn hình.`
        );
      }
    } catch (e) {
      // Transaction đã rollback ⇒ dữ liệu còn nguyên, chỉ cần báo lại cho người dùng.
      Alert.alert('Không hoàn tất được', e?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.wrap}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="cube" size={22} color={theme.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.h1, { color: theme.ink }]}>Container</Text>
            </View>
            <TouchableOpacity
              style={[styles.addContainerBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
              onPress={openAddContainer}
            >
              <Ionicons name="add-circle-outline" size={16} color={theme.accent} style={{ marginRight: 4 }} />
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>Thêm container</Text>
            </TouchableOpacity>
          </View>

          {/* 3 nút đếm tổng quan trạng thái kiện: Chưa dán nhãn, Chưa đủ SL, Bị cả 2 */}
          {containers.length > 0 && (
            <View style={styles.overviewContainer}>
              {/* Nút 1: Chưa dán nhãn */}
              <TouchableOpacity
                style={[
                  styles.overviewBtn,
                  {
                    backgroundColor: activeStatusFilter === 'unlabeled' ? theme.bad + '18' : theme.card,
                    borderColor: activeStatusFilter === 'unlabeled' ? theme.bad : theme.line,
                  },
                ]}
                onPress={() => setActiveStatusFilter(prev => prev === 'unlabeled' ? 'all' : 'unlabeled')}
                activeOpacity={0.7}
              >
                <View style={styles.overviewTopRow}>
                  <View style={[styles.overviewIconWrap, { backgroundColor: theme.bad + '20' }]}>
                    <Ionicons name="pricetag" size={12} color={theme.bad} />
                  </View>
                  <Text style={[styles.overviewCount, { color: theme.bad }]}>
                    {statusSummary.unlabeledCount}
                  </Text>
                </View>
                <Text style={[styles.overviewLabel, { color: theme.ink }]} numberOfLines={1}>
                  Chưa dán nhãn
                </Text>
                <Text style={[styles.overviewSub, { color: theme.sub }]}>
                  kiện
                </Text>
              </TouchableOpacity>

              {/* Nút 2: Chưa đủ SL */}
              <TouchableOpacity
                style={[
                  styles.overviewBtn,
                  {
                    backgroundColor: activeStatusFilter === 'incomplete' ? theme.warn + '18' : theme.card,
                    borderColor: activeStatusFilter === 'incomplete' ? theme.warn : theme.line,
                  },
                ]}
                onPress={() => setActiveStatusFilter(prev => prev === 'incomplete' ? 'all' : 'incomplete')}
                activeOpacity={0.7}
              >
                <View style={styles.overviewTopRow}>
                  <View style={[styles.overviewIconWrap, { backgroundColor: theme.warn + '20' }]}>
                    <Ionicons name="hourglass" size={12} color={theme.warn} />
                  </View>
                  <Text style={[styles.overviewCount, { color: theme.warn }]}>
                    {statusSummary.incompleteCount}
                  </Text>
                </View>
                <Text style={[styles.overviewLabel, { color: theme.ink }]} numberOfLines={1}>
                  Chưa đủ SL
                </Text>
                <Text style={[styles.overviewSub, { color: theme.sub }]}>
                  kiện
                </Text>
              </TouchableOpacity>

              {/* Nút 3: Bị cả hai */}
              <TouchableOpacity
                style={[
                  styles.overviewBtn,
                  {
                    backgroundColor: activeStatusFilter === 'both' ? '#dc262618' : theme.card,
                    borderColor: activeStatusFilter === 'both' ? '#dc2626' : theme.line,
                  },
                ]}
                onPress={() => setActiveStatusFilter(prev => prev === 'both' ? 'all' : 'both')}
                activeOpacity={0.7}
              >
                <View style={styles.overviewTopRow}>
                  <View style={[styles.overviewIconWrap, { backgroundColor: '#dc262620' }]}>
                    <Ionicons name="alert-circle" size={12} color="#dc2626" />
                  </View>
                  <Text style={[styles.overviewCount, { color: '#dc2626' }]}>
                    {statusSummary.bothCount}
                  </Text>
                </View>
                <Text style={[styles.overviewLabel, { color: theme.ink }]} numberOfLines={1}>
                  Bị cả hai
                </Text>
                <Text style={[styles.overviewSub, { color: theme.sub }]}>
                  kiện
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Banner trạng thái bộ lọc đang kích hoạt */}
          {isFilteringStatus && (
            <View
              style={[
                styles.filterActiveBanner,
                {
                  backgroundColor: currentFilterMeta.color + '15',
                  borderColor: currentFilterMeta.color + '40',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                <Ionicons name={currentFilterMeta.icon} size={15} color={currentFilterMeta.color} style={{ marginRight: 6 }} />
                <Text style={[styles.filterActiveText, { color: currentFilterMeta.color }]}>
                  Đang lọc: <Text style={{ fontWeight: '800' }}>{currentFilterMeta.label}</Text> ({filteredPalletCount} kiện)
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.clearFilterPill, { backgroundColor: currentFilterMeta.color }]}
                onPress={() => setActiveStatusFilter('all')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={13} color="#fff" style={{ marginRight: 3 }} />
                <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '700' }}>Hiện tất cả</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Ô tìm kiếm mã hàng */}
          {containers.length > 0 && (
            <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.card }]}>
              <Ionicons name="search-outline" size={18} color={theme.sub} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: theme.ink }]}
                placeholder="Tìm theo mã hàng, số hiệu (VD: 106160, D980470)..."
                placeholderTextColor={theme.sub}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={theme.sub} />
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Dòng trạng thái kết quả tìm kiếm */}
          {searchQuery.trim() ? (
            <View style={styles.searchResultRow}>
              <Text style={{ color: theme.sub, fontSize: 12 }}>
                Tìm thấy <Text style={{ color: theme.accent, fontWeight: '700' }}>{filtered.length}</Text>/{containers.length} container chứa &ldquo;{searchQuery.trim()}&rdquo;
              </Text>
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
                  Xoá tìm kiếm
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* FEAT-14 (AC-CONT-09): chip lọc PO chỉ có nghĩa khi đã có container. */}
          {containers.length > 0 && (
            <FilterChips
              options={[['all', 'Tất cả PO'], ...cpos.map(p => [p, p])]}
              activeValue={activeContainerFilter}
              onSelect={setContainerFilter}
              theme={theme}
            />
          )}

          {/* FEAT-14 (AC-CONT-09): đơn mới sau khi hoàn tất là trắng — KHÔNG fallback seed. */}
          {containers.length === 0 && (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14 }}>Chưa có container trong đơn hàng này.</Text>
              <Text style={{ color: theme.sub, fontSize: 12.5, marginTop: 6 }}>
                Bấm “Nhập JSON” ở tab Mã hàng và chọn file packing list để nạp container/kiện của đơn mới.
              </Text>
            </View>
          )}

          {/* Trạng thái không tìm thấy container khi lọc hoặc tìm kiếm */}
          {containers.length > 0 && filtered.length === 0 && (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.line, alignItems: 'center' }]}>
              <Ionicons name="search" size={26} color={theme.sub} style={{ marginBottom: 6 }} />
              <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14 }}>
                Không tìm thấy container phù hợp
              </Text>
              <Text style={{ color: theme.sub, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>
                {searchQuery.trim()
                  ? `Không có container nào chứa kiện có mã hàng hoặc số hiệu “${searchQuery.trim()}”.`
                  : (isFilteringStatus
                      ? `Không có kiện nào thuộc trạng thái “${currentFilterMeta.label}” trong bộ lọc hiện tại.`
                      : `Không có container nào thuộc PO “${activeContainerFilter}”.`)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {searchQuery.trim() ? (
                  <TouchableOpacity
                    style={[styles.clearSearchBtn, { backgroundColor: theme.accent, marginTop: 0 }]}
                    onPress={() => setSearchQuery('')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>Xoá tìm kiếm</Text>
                  </TouchableOpacity>
                ) : null}
                {isFilteringStatus ? (
                  <TouchableOpacity
                    style={[styles.clearSearchBtn, { backgroundColor: currentFilterMeta.color, marginTop: 0 }]}
                    onPress={() => setActiveStatusFilter('all')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>Bỏ lọc trạng thái</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}

        {filtered.map(c => {
          const isOpen = isAutoExpanded ? !expandedIds.has(`closed_${c.id}`) : expandedIds.has(c.id);
          const sortedPallets = c.sortedPallets;
          const visiblePallets = c.visiblePallets || sortedPallets;
          const containerPos = Array.from(new Set([
            c.po,
            ...(c.pallets ?? []).flatMap(p => (p.items ?? []).map(it => it.po)),
          ].filter(Boolean))).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
          const isMultiPo = containerPos.length > 1;

          let cDone = 0, totalQty = 0, doneQty = 0;
          sortedPallets.forEach(p => {
            const pd = palletDone(p);
            if (pd) cDone++;
            const q = p.items.reduce((s, it) => s + it.qty, 0);
            totalQty += q;
            const pPacked = p.items.reduce((s, it) => s + (it.packed_qty !== undefined ? it.packed_qty : (it.done ? it.qty : 0)), 0);
            doneQty += Math.min(q, pPacked);
          });
          const pct = c.pallets.length ? Math.round((cDone / c.pallets.length) * 1000) / 10 : 0;
          const isFull = cDone === c.pallets.length;
          // AC-EDIT-23: kiện chứa mã không còn trong đơn → cảnh báo, không tự xoá.
          const unknownNtks = [...new Set(
            c.pallets.flatMap(p => p.items.map(it => it.ntk)).filter(n => !knownNtks.has(n))
          )];

          const matchingSearchPallets = c.matchingSearchPallets || [];
          const isContainerMatched = isSearching && matchingSearchPallets.length > 0;
          const isStatusMatched = isFilteringStatus && visiblePallets.length > 0;
          const isCardHighlighted = isContainerMatched || isStatusMatched;
          const cardBorderColor = isContainerMatched ? theme.accent : currentFilterMeta.color;

          return (
            <View
              key={c.id}
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: isCardHighlighted ? cardBorderColor : theme.line,
                  borderWidth: isCardHighlighted ? (isContainerMatched ? 2 : 1.5) : 1,
                  ...(isCardHighlighted ? {
                    shadowColor: cardBorderColor,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.18,
                    shadowRadius: 6,
                    elevation: 3,
                  } : {}),
                },
              ]}
            >
              {/* Thanh thông báo nổi bật khi container khớp tìm kiếm */}
              {isContainerMatched && (
                <View style={[styles.matchedBanner, { backgroundColor: theme.accent + '15', borderColor: theme.accent + '40' }]}>
                  <Ionicons name="sparkles" size={13} color={theme.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.matchedBannerText, { color: theme.accent }]}>
                    Container chứa mã &ldquo;{searchQuery.trim()}&rdquo; ({matchingSearchPallets.length}/{c.pallets.length} kiện khớp)
                  </Text>
                </View>
              )}

              {/* Thanh thông báo khi đang lọc trạng thái kiện (Phương án A) */}
              {isStatusMatched && !isContainerMatched && (
                <View style={[styles.matchedBanner, { backgroundColor: currentFilterMeta.color + '15', borderColor: currentFilterMeta.color + '40' }]}>
                  <Ionicons name={currentFilterMeta.icon} size={13} color={currentFilterMeta.color} style={{ marginRight: 6 }} />
                  <Text style={[styles.matchedBannerText, { color: currentFilterMeta.color }]}>
                    Container có {visiblePallets.length}/{c.pallets.length} kiện {currentFilterMeta.label.toLowerCase()}
                  </Text>
                </View>
              )}

              <View style={styles.top}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 2 }} onPress={() => toggleExpand(c.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <Ionicons
                      name={isCardHighlighted ? 'cube' : 'cube-outline'}
                      size={18}
                      color={isCardHighlighted ? cardBorderColor : theme.accent}
                      style={{ marginRight: 2 }}
                    />
                    <Text style={{ color: isCardHighlighted ? cardBorderColor : theme.ink, fontWeight: '800', fontSize: 16 }}>
                      {c.container_no}
                    </Text>
                    {isContainerMatched && (
                      <View style={[styles.matchedBadge, { backgroundColor: theme.accent }]}>
                        <Ionicons name="search" size={10} color="#fff" style={{ marginRight: 3 }} />
                        <Text style={styles.matchedBadgeText}>
                          {matchingSearchPallets.length} kiện khớp
                        </Text>
                      </View>
                    )}
                    {isStatusMatched && (
                      <View style={[styles.matchedBadge, { backgroundColor: currentFilterMeta.color }]}>
                        <Ionicons name={currentFilterMeta.icon} size={10} color="#fff" style={{ marginRight: 3 }} />
                        <Text style={styles.matchedBadgeText}>
                          {visiblePallets.length}/{c.pallets.length} kiện
                        </Text>
                      </View>
                    )}
                  </View>
                  {isMultiPo ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 3, gap: 6 }}>
                      <Text style={{ color: theme.sub, fontSize: 12 }}>
                        PO: {containerPos.join(' · ')}{c.seal_no ? ` · Seal: ${c.seal_no}` : ''}
                      </Text>
                      <View style={[styles.multiPoBadge, { backgroundColor: theme.accent + '18', borderColor: theme.accent + '40' }]}>
                        <Text style={[styles.multiPoBadgeText, { color: theme.accent }]}>
                          {containerPos.length} PO
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={{ color: theme.sub, fontSize: 12, marginTop: 3 }}>
                      PO {c.po}{c.seal_no ? ` · Seal: ${c.seal_no}` : ''}
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.editContBtn, { borderColor: theme.line, backgroundColor: theme.bg }]}
                    onPress={() => openEditContainer(c)}
                  >
                    <Ionicons name="pencil" size={12} color={theme.accent} style={{ marginRight: 3 }} />
                    <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12 }}>Sửa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleExpand(c.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                    <Text style={{ color: isFull ? theme.good : (isCardHighlighted ? cardBorderColor : theme.ink), fontWeight: '700', fontSize: 13.5 }}>
                      {cDone}/{c.pallets.length} kiện
                    </Text>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color={theme.sub} style={{ marginLeft: 3 }} />
                  </TouchableOpacity>
                </View>
              </View>
              <ProgressBar pct={pct} color={isFull ? theme.good : theme.accent} theme={theme} />
              <View style={styles.numsRow}>
                <Text style={{ color: theme.sub, fontSize: 12 }}>{pct}% số kiện</Text>
                <Text style={{ color: theme.sub, fontSize: 12 }}>{doneQty}/{totalQty} pcs đã đóng</Text>
                {isFull && <Text style={{ color: theme.good, fontWeight: '700', fontSize: 12 }}>Sẵn sàng đóng container ✓</Text>}
              </View>
              {unknownNtks.length > 0 && (
                <Text style={{ color: theme.warn, fontSize: 11.5, marginTop: 8 }}>
                  ⚠ Kiện chứa mã không có trong đơn: {unknownNtks.join(', ')}
                </Text>
              )}
              {isOpen && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity style={styles.addPalletBtn} onPress={() => openAddPallet(c, containerPos)}>
                    <Ionicons name="add" size={15} color={theme.accent} style={{ marginRight: 4 }} />
                    <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>Thêm kiện</Text>
                  </TouchableOpacity>
                  {isFilteringStatus && visiblePallets.length < c.pallets.length && (
                    <View style={[styles.hiddenPalletsNote, { backgroundColor: theme.bg, borderColor: theme.line }]}>
                      <Ionicons name="filter-outline" size={12} color={theme.sub} style={{ marginRight: 5 }} />
                      <Text style={{ color: theme.sub, fontSize: 11.5 }}>
                        Phương án A: Đang ẩn {c.pallets.length - visiblePallets.length} kiện đã hoàn thành đầy đủ
                      </Text>
                    </View>
                  )}
                  {visiblePallets.map(p => (
                    <PalletRow
                      key={p.id}
                      pallet={p}
                      isMultiPo={isMultiPo}
                      activeStatusFilter={activeStatusFilter}
                      onOpenPackModal={(item, pNo) => setPackModalTarget({ item, palletNo: pNo })}
                      onToggleLabel={async (palletLineId) => {
                        const res = await togglePalletLineLabel(palletLineId);
                        if (res && res.ok === false) {
                          Alert.alert('Lỗi', res.error?.message || 'Không thể đổi trạng thái dán nhãn.');
                        }
                      }}
                      onToggleLine={togglePalletLine}
                      onTogglePallet={togglePallet}
                      onEditPallet={pallet => openEditPallet(c, pallet, containerPos)}
                      onDeletePallet={pallet => confirmDeletePallet(c, pallet)}
                      theme={theme}
                      highlightNtk={searchQuery.trim()}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={[styles.finishBox, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={{ color: theme.sub, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
            Khi các mã PO hoặc đơn hàng ({done}/{total} kiện) đã xong, bấm để lựa chọn mã PO cần lưu trữ hoặc hoàn tất toàn bộ.
          </Text>
          <TouchableOpacity
            style={[styles.finishBtn, { backgroundColor: theme.good, opacity: finishing ? 0.6 : 1 }]}
            onPress={handleFinish}
            disabled={finishing}
          >
            <Ionicons name="checkmark-done-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>
              {finishing ? 'Đang hoàn tất…' : 'Hoàn tất đơn hàng / chọn PO'}
            </Text>
          </TouchableOpacity>
        </View>

        {archives.length > 0 && (
          <>
            <View style={styles.archiveHeadRow}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => setShowArchivesSection(v => !v)}
                activeOpacity={0.7}
              >
                <Ionicons name="archive-outline" size={16} color={theme.ink} style={{ marginRight: 6 }} />
                <Text style={[styles.archiveHead, { color: theme.ink, marginBottom: 0 }]}>
                  Đơn hàng đã lưu trữ ({archives.length})
                </Text>
                <Ionicons
                  name={showArchivesSection ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={theme.sub}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
              {/* AC-ARCH-01: thu gọn / mở nội dung của TẤT CẢ thẻ lưu trữ. */}
              {showArchivesSection && (
                <TouchableOpacity
                  style={[styles.archiveTool, { borderColor: theme.line, backgroundColor: theme.card }]}
                  onPress={toggleAllArchives}
                >
                  <Ionicons
                    name={isAnyArchiveOpen ? 'eye-off-outline' : 'eye-outline'}
                    size={13}
                    color={theme.accent}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 11.5 }}>
                    {isAnyArchiveOpen ? 'Ẩn nội dung' : 'Hiện nội dung'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {showArchivesSection && archives.map(a => (
              <ArchiveCard
                key={a.id}
                archive={a}
                theme={theme}
                expanded={!!archivesOpen[a.id]}
                onToggle={toggleArchive}
                onDelete={runDeleteArchive}
                busy={archivesBusy}
              />
            ))}
          </>
        )}

        {draft && (
          <PalletEditSheet
            containerLabel={`📦 ${draft.label}${draft.po ? ` · PO ${draft.po}` : ''}`}
            pallet={draft.pallet}
            itemOptions={draftItemOptions}
            defaultNo={draft.nextNo}
            onClose={() => setDraft(null)}
            onSubmit={draft.pallet
              ? payload => updatePallet(draft.containerId, draft.pallet.pallet_no ?? draft.pallet.no, payload)
              : payload => addPallet(draft.containerId, payload)}
            onDelete={no => removePallet(draft.containerId, no)}
            theme={theme}
          />
        )}

        {/* FEAT-25: Modal chỉnh sửa / thêm mới container */}
        {containerDraft && (
          <ContainerEditSheet
            container={containerDraft.container}
            poOptions={poOptionsForContainer}
            onClose={() => setContainerDraft(null)}
            onSubmit={async (payload) => {
              if (containerDraft.isAdd) {
                return addContainer(payload.po, {
                  container_no: payload.container_no,
                  seal_no: payload.seal_no,
                });
              } else {
                return updateContainer(containerDraft.container.id, {
                  container_no: payload.container_no,
                  seal_no: payload.seal_no,
                });
              }
            }}
            onDelete={containerDraft.container ? () => removeContainer(containerDraft.container.id) : undefined}
            theme={theme}
          />
        )}

        <FinishOrderModal
          key={showFinishModal ? 'open' : 'closed'}
          visible={showFinishModal}
          onClose={() => setShowFinishModal(false)}
          onConfirm={runFinish}
          poList={poListForFinish}
          finishing={finishing}
          theme={theme}
        />

        {packModalTarget && (
          <PackStatusModal
            key={packModalTarget.item.id}
            visible={Boolean(packModalTarget)}
            item={packModalTarget.item}
            palletNo={packModalTarget.palletNo}
            onClose={() => setPackModalTarget(null)}
            onSave={async (payload) => {
              const res = await updatePalletLinePackStatus(payload.palletLineId, payload);
              if (res && res.ok === false) {
                Alert.alert('Không lưu được', res.error?.message || 'Có lỗi xảy ra.');
              }
            }}
            theme={theme}
          />
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 14, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  h1: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  searchInput: { flex: 1, fontSize: 14.5, padding: 0 },
  searchResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  clearSearchBtn: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  addContainerBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  editContBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' },
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  emptyBox: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 12 },
  finishBox: { borderWidth: 1, borderRadius: 14, padding: 16, marginVertical: 16, elevation: 1 },
  addPalletBtn: { paddingVertical: 9, flexDirection: 'row', alignItems: 'center' },
  finishBtn: { padding: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  archiveHead: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  archiveHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  archiveTool: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center' },
  multiPoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  multiPoBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  matchedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  matchedBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  matchedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  matchedBadgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '700',
  },
  overviewContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  overviewBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  overviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  overviewIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewCount: {
    fontSize: 16,
    fontWeight: '800',
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  overviewSub: {
    fontSize: 9.5,
    marginTop: 1,
  },
  filterActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  filterActiveText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  clearFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  hiddenPalletsNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 2,
    marginBottom: 8,
  },
});