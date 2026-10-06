// src/screens/ContainersScreen.js
import React, { useState } from 'react';
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
import PalletEditSheet from '@/components/PalletEditSheet';

export default function ContainersScreen() {
  const theme = getTheme(useColorScheme());
  const {
    items, togglePalletLine, finishOrder, archives, finishing, init,
    activeContainerFilter, setContainerFilter, containerData,
    addPallet, updatePallet, removePallet, deleteArchive, archivesBusy,
  } = useAppStore();
  const [expandedIds, setExpandedIds] = useState(new Set());
  // FEAT-15 (AC-ARCH-01/03): trạng thái mở nội dung của các thẻ đơn lưu trữ.
  // `null` = điều khiển từng thẻ; `true`/`false` = thu gọn/mở TẤT CẢ (nút 👁).
  // State cục bộ, không lưu (`§0.2` #9) ⇒ mở app lại thì về mặc định thu gọn.
  const [archivesAll, setArchivesAll] = useState(null);
  const [archivesOpen, setArchivesOpen] = useState({});
  // FEAT-10: form thêm/sửa kiện. `draftPallet` = null ⇒ đang thêm mới.
  const [draft, setDraft] = useState(null); // { containerId, label, pallet, nextNo }
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
    setDraft({ containerId: c.id, label: c.container_no, pallet: null, nextNo });
  }

  function openEditPallet(c, pallet) {
    setDraft({ containerId: c.id, label: c.container_no, pallet, nextNo: null });
  }

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

  function handleFinish() {
    if (finishing) return;
    const message = done < total
      ? `Mới đóng xong ${done}/${total} kiện trên tất cả container.\nBạn có chắc muốn hoàn tất đơn hàng và lưu trữ dữ liệu hiện tại không?`
      : 'Xác nhận hoàn tất đơn hàng hiện tại?\nDữ liệu sẽ được lưu trữ lại và màn hình làm việc sẽ được dọn sạch để bắt đầu đơn mới.';
    Alert.alert('Hoàn tất đơn hàng', message, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xác nhận', onPress: runFinish },
    ]);
  }

  async function runFinish() {
    try {
      const res = await finishOrder();
      // BUSY = có lần hoàn tất khác đang chạy (chặn INV-B1) ⇒ coi như đã bỏ qua.
      if (res && res.ok === false && res.error?.code !== 'BUSY') {
        Alert.alert('Không hoàn tất được', 'Đơn hàng hiện tại đã được hoàn tất trước đó. Màn hình sẽ được tải lại.');
        init();
      }
    } catch (e) {
      // Transaction đã rollback ⇒ dữ liệu còn nguyên, chỉ cần báo lại cho người dùng.
      Alert.alert('Không hoàn tất được', e?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={[styles.h1, { color: theme.ink }]}>📦 Container</Text>
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
              <TouchableOpacity style={styles.top} onPress={() => toggleExpand(c.id)}>
                <View>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 16 }}>📦 {c.container_no}</Text>
                  <Text style={{ color: theme.sub, fontSize: 11.5, marginTop: 2 }}>PO {c.po}</Text>
                </View>
                <Text style={{ color: isFull ? theme.good : theme.ink, fontWeight: '700' }}>
                  {cDone}/{c.pallets.length} kiện {isOpen ? '▴' : '▾'}
                </Text>
              </TouchableOpacity>
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
                      onDeletePallet={pallet => openEditPallet(c, pallet)}
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
            Khi đơn hàng hiện tại ({done}/{total} kiện) đã xong, bấm để lưu trữ toàn bộ dữ liệu và dọn màn hình cho đơn hàng mới.
          </Text>
          <TouchableOpacity
            style={[styles.finishBtn, { backgroundColor: theme.bad, opacity: finishing ? 0.6 : 1 }]}
            onPress={handleFinish}
            disabled={finishing}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {finishing ? '⏳ Đang hoàn tất…' : '✅ Hoàn tất đơn hàng hiện tại'}
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
            containerLabel={`📦 ${draft.label}`}
            pallet={draft.pallet}
            itemOptions={itemNtks}
            defaultNo={draft.nextNo}
            onClose={() => setDraft(null)}
            onSubmit={draft.pallet
              ? payload => updatePallet(draft.containerId, draft.pallet.pallet_no ?? draft.pallet.no, payload)
              : payload => addPallet(draft.containerId, payload)}
            onDelete={no => removePallet(draft.containerId, no)}
            theme={theme}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 14, paddingBottom: 40 },
  h1: { fontSize: 19, fontWeight: '700', marginBottom: 4 },
  card: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  numsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 9 },
  emptyBox: { borderWidth: 1.5, borderRadius: 6, padding: 14, marginTop: 8, marginBottom: 10 },
  finishBox: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 6, padding: 14, marginVertical: 16 },
  addPalletBtn: { paddingVertical: 8 },
  finishBtn: { padding: 13, borderRadius: 4, alignItems: 'center' },
  archiveHead: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  archiveHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  archiveTool: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
});