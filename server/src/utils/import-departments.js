/**
 * Tiện ích phòng ban cho Import nhân viên từ Excel (logic THUẦN, không đụng DB).
 * - Parse ô "Phòng ban" có phòng kiêm nhiệm: Tên phòng chính {kiêm nhiệm 1; kiêm nhiệm 2}
 * - Tra cứu phòng ban trên bản chụp (snapshot) danh sách phòng ban hiện có
 * - Lập kế hoạch tạo / khôi phục / gán mã phòng ban khi xác nhận import
 * Tách riêng khỏi user.service.js để test được độc lập, không cần MongoDB.
 */

import { normalizeDeptName, normalizeDeptCode } from '../models/department.model.js';

// Tách ô "Phòng ban" dạng  Tên phòng chính {kiêm nhiệm 1; kiêm nhiệm 2}
// Trả về { primaryName, extraNames, warnings, error }.
// allowEmptyPrimary: cho phép bỏ trống phòng chính ở ô này khi dòng đã có cột "Mã phòng ban".
export function parseDepartmentCell(raw, { allowEmptyPrimary = false } = {}) {
  const text = String(raw ?? '').trim();
  const out = { primaryName: '', extraNames: [], warnings: [], error: null };
  if (!text) return out;

  const open = text.indexOf('{');
  const close = text.indexOf('}');
  const openCount = (text.match(/\{/g) || []).length;
  const closeCount = (text.match(/\}/g) || []).length;

  // Không có ngoặc nào -> chỉ có phòng chính
  if (open === -1 && close === -1) {
    out.primaryName = text.replace(/\s+/g, ' ');
    return out;
  }
  if (openCount !== 1 || closeCount !== 1 || close < open) {
    out.error =
      'cú pháp phòng ban không hợp lệ: cần đúng 1 cặp { } và "}" phải đứng sau "{" (vd: Tài chính-kế toán {Kiểm kho; Chính trị})';
    return out;
  }
  if (text.slice(close + 1).trim() !== '') {
    out.error = 'cú pháp phòng ban không hợp lệ: không được có chữ nào sau dấu "}"';
    return out;
  }

  out.primaryName = text.slice(0, open).replace(/\s+/g, ' ').trim();
  if (!out.primaryName && !allowEmptyPrimary) {
    out.error = 'thiếu phòng ban chính (phải ghi phòng chính ở NGOÀI dấu { })';
    return out;
  }

  const parts = text
    .slice(open + 1, close)
    .split(';')
    .map((p) => p.replace(/\s+/g, ' ').trim());
  const nonEmpty = parts.filter(Boolean);

  if (nonEmpty.length === 0) {
    out.warnings.push('Ô phòng ban có { } nhưng trống — coi như không có phòng kiêm nhiệm');
    return out;
  }
  if (parts.length !== nonEmpty.length) {
    out.warnings.push('Có dấu ";" thừa trong { } (đã bỏ qua phần trống)');
  }

  const primaryKey = normalizeDeptName(out.primaryName);
  const seen = new Set();
  for (const name of nonEmpty) {
    const key = normalizeDeptName(name);
    if (primaryKey && key === primaryKey) {
      out.error = `phòng kiêm nhiệm "${name}" trùng với phòng chính`;
      return out;
    }
    if (seen.has(key)) {
      out.error = `phòng kiêm nhiệm "${name}" bị ghi trùng trong { }`;
      return out;
    }
    seen.add(key);
    if (name.includes(',')) {
      out.warnings.push(`Tên "${name}" có dấu phẩy — nếu muốn ngăn cách nhiều phòng, hãy dùng dấu ";"`);
    }
    out.extraNames.push(name);
  }
  return out;
}

// Ngược lại với parseDepartmentCell: dựng chuỗi "Chính {a; b}" để xuất Excel (import lại được ngay)
export function formatDepartmentCell(primaryName, extraNames = []) {
  const extras = (extraNames ?? []).map((n) => String(n ?? '').trim()).filter(Boolean);
  const primary = String(primaryName ?? '').trim();
  return extras.length ? `${primary} {${extras.join('; ')}}` : primary;
}

// Tìm phòng ban trong bản chụp danh sách phòng ban: ưu tiên MÃ, sau đó TÊN (không phân biệt hoa/thường/dấu).
// Trả về cả phòng đã xóa mềm (isActive=false) để import có thể khôi phục thay vì tạo trùng.
export function findDeptInSnapshot(snapshot, { code, name } = {}) {
  const normalizedCode = code ? normalizeDeptCode(code) : '';
  if (normalizedCode) {
    const byCode = snapshot.find((d) => d.code && normalizeDeptCode(d.code) === normalizedCode);
    if (byCode) return byCode;
  }
  const key = normalizeDeptName(name);
  if (key) {
    const byName = snapshot.find((d) => normalizeDeptName(d.name) === key);
    if (byName) return byName;
  }
  return null;
}

// Phân giải toàn bộ phòng ban (chính + kiêm nhiệm) của 1 dòng Excel. KHÔNG tạo gì trong DB.
// Trả về { error } hoặc { error: null, warnings, primary: {name, fileCode}, extras: [{name}], extrasProvided }
export function resolveRowDepartments({ cellRaw, codeRaw }, snapshot) {
  const fileCode = normalizeDeptCode(codeRaw);
  const cell = parseDepartmentCell(cellRaw, { allowEmptyPrimary: Boolean(fileCode) });
  if (cell.error) return { error: cell.error };
  if (!cell.primaryName && !fileCode) {
    return { error: 'thiếu phòng ban (cần Mã phòng ban hoặc Phòng ban)' };
  }

  const warnings = [...cell.warnings];
  const foundPrimary = findDeptInSnapshot(snapshot, { code: fileCode, name: cell.primaryName });
  const primaryName = foundPrimary?.name ?? (cell.primaryName || fileCode);
  if (
    foundPrimary &&
    cell.primaryName &&
    normalizeDeptName(cell.primaryName) !== normalizeDeptName(foundPrimary.name)
  ) {
    warnings.push(
      `Tên phòng ban "${cell.primaryName}" khác tên trong hệ thống "${foundPrimary.name}" (khớp theo mã) — dùng "${foundPrimary.name}"`,
    );
  }
  const primaryKey = normalizeDeptName(primaryName);

  const extras = [];
  for (const raw of cell.extraNames) {
    const found = findDeptInSnapshot(snapshot, { name: raw });
    const name = found?.name ?? raw;
    const key = normalizeDeptName(name);
    if (key === primaryKey) {
      return { error: `phòng kiêm nhiệm "${raw}" trùng với phòng chính "${primaryName}"` };
    }
    if (extras.some((e) => normalizeDeptName(e.name) === key)) {
      return { error: `phòng kiêm nhiệm "${raw}" bị ghi trùng trong { }` };
    }
    extras.push({ name });
  }

  return {
    error: null,
    warnings,
    primary: { name: primaryName, fileCode },
    extras,
    extrasProvided: extras.length > 0,
  };
}

// Gộp mọi phòng ban được nhắc tới trong các dòng SẼ ĐƯỢC GHI thành 1 danh sách cho bước preview:
// phòng nào đã có/chưa có, đã có mã chưa, mã gợi ý (từ file) — để admin điền mã trước khi xác nhận.
// items: [{ rowIndex, primary: {name, fileCode}, extras: [{name}] }]
export function summarizeImportDepartments(items, snapshot) {
  const map = new Map();

  const touch = (name, fileCode, rowIndex, role) => {
    const key = normalizeDeptName(name);
    let entry = map.get(key);
    if (!entry) {
      const found = findDeptInSnapshot(snapshot, { name });
      entry = {
        key,
        name: found?.name ?? name,
        exists: Boolean(found),
        isActive: found ? found.isActive !== false : true,
        currentCode: found?.code ? normalizeDeptCode(found.code) : '',
        fileCode: '',
        primaryCount: 0,
        extraCount: 0,
        rowIndexes: [],
      };
      map.set(key, entry);
    }
    if (fileCode && !entry.fileCode) entry.fileCode = fileCode;
    if (role === 'primary') entry.primaryCount += 1;
    else entry.extraCount += 1;
    if (!entry.rowIndexes.includes(rowIndex)) entry.rowIndexes.push(rowIndex);
  };

  for (const item of items) {
    touch(item.primary.name, item.primary.fileCode, item.rowIndex, 'primary');
    for (const extra of item.extras ?? []) touch(extra.name, '', item.rowIndex, 'extra');
  }

  const list = [...map.values()].map((e) => ({
    ...e,
    suggestedCode: e.currentCode || e.fileCode,
    needsCode: !e.currentCode,
    isNew: !e.exists,
    willReactivate: e.exists && !e.isActive,
    issues: [],
  }));

  // Phát hiện mã gợi ý bị trùng (giữa các phòng cần mã trong file, hoặc trùng mã phòng đã có)
  const needing = list.filter((e) => e.needsCode && e.suggestedCode);
  for (const e of needing) {
    const sameInFile = needing.filter(
      (o) => o !== e && normalizeDeptCode(o.suggestedCode) === normalizeDeptCode(e.suggestedCode),
    );
    if (sameInFile.length) {
      e.issues.push(`Mã "${e.suggestedCode}" đang trùng với phòng "${sameInFile[0].name}" trong file — hãy đổi mã`);
    }
    const owner = snapshot.find(
      (d) =>
        d.code &&
        normalizeDeptCode(d.code) === normalizeDeptCode(e.suggestedCode) &&
        normalizeDeptName(d.name) !== e.key,
    );
    if (owner) {
      e.issues.push(`Mã "${e.suggestedCode}" đã được dùng cho phòng ban "${owner.name}" — hãy đổi mã`);
    }
  }

  list.sort((a, b) => Number(b.needsCode) - Number(a.needsCode) || a.name.localeCompare(b.name, 'vi'));
  return list;
}

// Lập kế hoạch tạo / khôi phục / gán mã phòng ban lúc XÁC NHẬN import (chưa ghi gì — chỉ kiểm tra và liệt kê bước).
// items: [{ key, name }] (mỗi phòng 1 lần); providedCodes: { [key]: mã admin nhập ở bước preview }
// Quy tắc: MỌI phòng (chính lẫn kiêm nhiệm) đều phải có mã; phòng đã có mã thì GIỮ NGUYÊN mã cũ.
export function planImportDepartments(items, snapshot, providedCodes = {}) {
  const errors = [];
  const steps = [];

  for (const item of items) {
    const found = findDeptInSnapshot(snapshot, { name: item.name });
    const desiredCode = normalizeDeptCode(providedCodes?.[item.key] ?? '');

    if (found) {
      const existingCode = found.code ? normalizeDeptCode(found.code) : '';
      const code = existingCode || desiredCode;
      if (!code) {
        errors.push(`Phòng ban "${found.name}" chưa có mã phòng ban — hãy nhập mã`);
        continue;
      }
      steps.push({
        key: item.key,
        name: found.name,
        deptId: found._id,
        op: found.isActive === false ? 'reactivate' : existingCode ? 'use' : 'setCode',
        reactivate: found.isActive === false,
        setCode: !existingCode,
        code,
      });
    } else {
      if (!desiredCode) {
        errors.push(`Phòng ban mới "${item.name}" chưa có mã phòng ban — hãy nhập mã`);
        continue;
      }
      steps.push({
        key: item.key,
        name: item.name,
        deptId: null,
        op: 'create',
        reactivate: false,
        setCode: true,
        code: desiredCode,
      });
    }
  }

  // Trùng mã giữa các phòng trong cùng lần import
  const byCode = new Map();
  for (const s of steps) {
    const other = byCode.get(s.code);
    if (other && other.key !== s.key) {
      errors.push(`Mã "${s.code}" bị dùng cho cả "${other.name}" và "${s.name}" — mỗi phòng cần 1 mã riêng`);
    } else {
      byCode.set(s.code, s);
    }
  }
  // Trùng mã với phòng ban khác đã có trong hệ thống
  for (const s of steps) {
    if (!s.setCode) continue;
    const owner = snapshot.find(
      (d) => d.code && normalizeDeptCode(d.code) === s.code && String(d._id) !== String(s.deptId ?? ''),
    );
    if (owner) {
      errors.push(`Mã "${s.code}" đã được dùng cho phòng ban "${owner.name}" — hãy chọn mã khác cho "${s.name}"`);
    }
  }

  return { ok: errors.length === 0, errors, steps };
}