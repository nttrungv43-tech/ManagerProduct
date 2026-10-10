// src/screens/ContainersScreen.js
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export default function ContainersScreen() {
  const theme = getTheme(useColorScheme());
  const {
    items, poRows, togglePalletLine, finishOrder, archives, finishing, init,
    activeContainerFilter, setContainerFilter, containerData,
    addPallet, updatePallet, removePallet, deleteArchive, archivesBusy,
    updateContainer, removeContainer, addContainer,
  } = useAppStore();
  const [expandedIds, setExpandedIds] = useState(new Set());
  // FEAT-15 (AC-ARCH-01/03): trạng thái mở nội dung của các thẻ đơn lưu trữ.
  // `null` = điều khiển từng thẻ; `true`/`false` = thu gọn/mở TẤT CẢ (nút 👁).
  // State cục bộ, không lưu (`§0.2` #9) ⇒ mở app lại thì về mặc định thu gọn.
  const [archivesAll, setArchivesAll] = useState(null);
  const [archivesOpen, setArchivesOpen] = useState({});
  // FEAT-10: form thêm/sửa kiện. `draftPallet` = null ⇒ đang thêm mới.
  const [draft, setDraft] = useState(null); // { containerId, label, po, pallet, nextNo }
  // FEAT-25: form thêm/sửa container. `containerDraft` = null ⇒ đang đóng.
  const [containerDraft, setContainerDraft] = useState(null); // { isAdd, container }
  // FEAT-21: `containerData` là cây từ bảng thật (`containers` → `pallets` → `pallet_lines`),
  // không phải blob JSON, và luôn là mảng ⇒ không còn fallback seed.
  const containers = containerData;
  // FEAT-23 §sort: danh sách PO **tăng dần** theo số (`'2919'` < `'2920'` < `'2929'`). `p.code`
  // là số dạng chuỗi nên `localeCompare` sẽ sai (`'2929'` > `'2919'` nhưng `'60' > '500'`). So sánh
  // số trước, chỉ tới `localeCompare` khi một trong hai không phải số — tránh sai với PO lẻ
  // không mang số.
  const cpos = Array.from(new Set(containers.map(c => c.po).filter(Boolean)))
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const filtered = containers.filter(
    c => activeContainerFilter === 'all' || c.po === activeContainerFilter
  );
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
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  }

  function openAddPallet(c) {
    const nextNo = (c.pallets || []).reduce((m, p) => Math.max(m, p.pallet_no ?? p.no), 0) + 1;
    setDraft({ containerId: c.id, label: c.container_no, po: c.po, pallet: null, nextNo });
  }

  function openEditPallet(c, pallet) {
    setDraft({ containerId: c.id, label: c.container_no, po: c.po, pallet, nextNo: null });
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

  // Danh sách mã hàng khả dụng cho kiện đang thêm / sửa (lọc theo PO của container)
  const draftItemOptions = useMemo(() => {
    if (!draft) return [];
    const poItems = draft.po ? items.filter(it => it.po === draft.po) : items;
    const baseItems = poItems.length > 0 ? poItems : items;
    const map = new Map();
    baseItems.forEach(it => {
      if (it.ntk && !map.has(it.ntk)) {
        map.set(it.ntk, { ntk: it.ntk, target: it.target, order_line_id: it.order_line_id });
      }
    });
    if (draft.pallet?.items) {
      draft.pallet.items.forEach(it => {
        if (it.ntk && !map.has(it.ntk)) {
          map.set(it.ntk, { ntk: it.ntk, target: 0, order_line_id: it.order_line_id });
        }
      });
    }
    return Array.from(map.values()).sort((a, b) => a.ntk.localeCompare(b.ntk));
  }, [items, draft]);


  // FEAT-15: chạm mũi tên trên thẻ đơn lưu trữ. Nếu đang ở chế độ "thu gọn tất cả"
  // thì chuyển sang điều khiển từng thẻ và mở đúng thẻ vừa chạm (AC-ARCH-03).
  function toggleArchive(id) {
    const isOpen = archivesAll === null ? !!archivesOpen[id] : !archivesAll;
    setArchivesOpen(prev => ({ ...prev, [id]: !isOpen }));
    if (archivesAll !== null) setArchivesAll(null);
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
      const poCode = c?.po;
      if (!poCode) return;
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
      (c?.pallets || []).forEach(p => {
        entry.palletsTotal += 1;
        if (palletDone(p)) {
          entry.palletsDone += 1;
        }
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
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.headerRow}>
          <Text style={[styles.h1, { color: theme.ink }]}>📦 Container</Text>
          <TouchableOpacity
            style={[styles.addContainerBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
            onPress={openAddContainer}
          >
            <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>＋ Thêm container</Text>
          </TouchableOpacity>
        </View>
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

        {filtered.map(c => {
          const isOpen = expandedIds.has(c.id);
          const sortedPallets = (c.pallets ?? []).sort(
            (a, b) => (a.pallet_no ?? a.no) - (b.pallet_no ?? b.no)
          );
          let cDone = 0, totalQty = 0, doneQty = 0;
          sortedPallets.forEach(p => {
            const pd = palletDone(p);
            if (pd) cDone++;
            const q = p.items.reduce((s, it) => s + it.qty, 0);
            totalQty += q;
            if (pd) doneQty += q;
          });
          const pct = c.pallets.length ? Math.round((cDone / c.pallets.length) * 1000) / 10 : 0;
          const isFull = cDone === c.pallets.length;
          // AC-EDIT-23: kiện chứa mã không còn trong đơn → cảnh báo, không tự xoá.
          const unknownNtks = [...new Set(
            c.pallets.flatMap(p => p.items.map(it => it.ntk)).filter(n => !knownNtks.has(n))
          )];

          return (
            <View key={c.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <View style={styles.top}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 2 }} onPress={() => toggleExpand(c.id)}>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 16 }}>📦 {c.container_no}</Text>
                  <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 2 }}>
                    PO {c.po}{c.seal_no ? ` · Seal: ${c.seal_no}` : ''}
                  </Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.editContBtn, { borderColor: theme.line, backgroundColor: theme.bg }]}
                    onPress={() => openEditContainer(c)}
                  >
                    <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12 }}>✏️ Sửa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleExpand(c.id)} style={{ paddingVertical: 4 }}>
                    <Text style={{ color: isFull ? theme.good : theme.ink, fontWeight: '700', fontSize: 13.5 }}>
                      {cDone}/{c.pallets.length} kiện {isOpen ? '▴' : '▾'}
                    </Text>
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
                  <TouchableOpacity style={styles.addPalletBtn} onPress={() => openAddPallet(c)}>
                    <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12.5 }}>＋ Thêm kiện</Text>
                  </TouchableOpacity>
                  {sortedPallets.map(p => (
                    <PalletRow
                      key={p.id}
                      pallet={p}
                      onToggleLine={togglePalletLine}
                      onEditPallet={pallet => openEditPallet(c, pallet)}
                      onDeletePallet={pallet => confirmDeletePallet(c, pallet)}
                      theme={theme}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={[styles.finishBox, { backgroundColor: theme.card, borderColor: theme.ink }]}>
          <Text style={{ color: theme.sub, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
            Khi các mã PO hoặc đơn hàng ({done}/{total} kiện) đã xong, bấm để lựa chọn mã PO cần lưu trữ hoặc hoàn tất toàn bộ.
          </Text>
          <TouchableOpacity
            style={[styles.finishBtn, { backgroundColor: theme.bad, opacity: finishing ? 0.6 : 1 }]}
            onPress={handleFinish}
            disabled={finishing}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {finishing ? '⏳ Đang hoàn tất…' : '✅ Hoàn tất đơn hàng / chọn PO'}
            </Text>
          </TouchableOpacity>
        </View>

        {archives.length > 0 && (
          <>
            <View style={styles.archiveHeadRow}>
              <Text style={[styles.archiveHead, { color: theme.ink }]}>
                📁 Đơn hàng đã lưu trữ ({archives.length})
              </Text>
              {/* AC-ARCH-01: thu gọn / mở nội dung của TẤT CẢ thẻ lưu trữ. */}
              <TouchableOpacity
                style={[styles.archiveTool, { borderColor: theme.line }]}
                onPress={() => setArchivesAll(v => (v === false ? true : false))}
              >
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 11.5 }}>
                  {archivesAll === false ? '👁 Hiện nội dung' : '👁 Ẩn nội dung'}
                </Text>
              </TouchableOpacity>
            </View>
            {archives.map(a => (
              <ArchiveCard
                key={a.id}
                archive={a}
                theme={theme}
                expanded={archivesAll === null ? !!archivesOpen[a.id] : !archivesAll}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 14, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  h1: { fontSize: 19, fontWeight: '700' },
  addContainerBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  card: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  editContBtn: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  emptyBox: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginTop: 8, marginBottom: 10 },
  finishBox: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 6, padding: 14, marginVertical: 16 },
  addPalletBtn: { paddingVertical: 8 },
  finishBtn: { padding: 13, borderRadius: 4, alignItems: 'center' },
  archiveHead: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  archiveHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  archiveTool: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
});