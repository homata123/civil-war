'use strict';
// ============ Dữ liệu tĩnh: địa hình, binh chủng, trận hình, công trình, quốc gia ============
(function () {
  CW.T = { SEA: 0, LAKE: 1, PLAIN: 2, FOREST: 3, HILL: 4, MOUNT: 5, DESERT: 6, STEPPE: 7 };
  CW.TERRAIN = [
    { name: 'Biển', move: 0, def: 0 },
    { name: 'Hồ', move: 0, def: 0 },
    { name: 'Đồng bằng', move: 1, def: 0 },
    { name: 'Rừng', move: 1.5, def: 0.10 },
    { name: 'Đồi', move: 1.7, def: 0.15 },
    { name: 'Núi', move: 3.6, def: 0.25 },
    { name: 'Sa mạc', move: 1.4, def: 0 },
    { name: 'Thảo nguyên', move: 1, def: 0 },
  ];

  CW.DAYS_PER_SEC = 2;      // ở tốc độ x1: 2 ngày / giây
  CW.DAYS_PER_MONTH = 30;
  CW.DAYS_PER_YEAR = 360;

  // Chi phí tính cho mỗi 100 binh sĩ
  CW.UNIT_KEYS = ['inf', 'arc', 'cav', 'sie'];
  CW.UNITS = {
    inf: { name: 'Bộ binh', short: 'Bộ', icon: '🛡', atk: 10, def: 10, spd: 1.0, cost: { gold: 40, food: 30, weapons: 12 }, days: 10, upkeep: { food: 6, gold: 3 } },
    arc: { name: 'Cung thủ', short: 'Cung', icon: '🏹', atk: 12, def: 6, spd: 1.0, cost: { gold: 55, food: 30, weapons: 8, wood: 25 }, days: 12, upkeep: { food: 6, gold: 3 } },
    cav: { name: 'Kỵ binh', short: 'Kỵ', icon: '🐎', atk: 17, def: 11, spd: 1.7, cost: { gold: 120, food: 60, weapons: 18 }, days: 16, upkeep: { food: 12, gold: 6 } },
    sie: { name: 'Công thành', short: 'Xa', icon: '⚙', atk: 3, def: 4, spd: 0.75, cost: { gold: 90, wood: 90, iron: 20 }, days: 20, upkeep: { food: 6, gold: 4 } },
  };

  CW.FORMATIONS = {
    phuong: { name: 'Phương trận', atk: 0.95, def: 1.25, spd: 0.9, beats: 'phongthi', desc: 'Khối vuông vững chắc. Phòng thủ +25%. Khắc chế Phong thỉ.' },
    phongthi: { name: 'Phong thỉ trận', atk: 1.25, def: 0.85, spd: 1.0, beats: 'nhanhanh', desc: 'Mũi tên đột phá. Công +25%, kỵ binh mạnh thêm. Khắc chế Nhạn hành.' },
    hacdy: { name: 'Hạc dực trận', atk: 1.1, def: 1.0, spd: 0.95, beats: 'truongxa', desc: 'Cánh hạc bao vây. Công +10%, +15% khi đông quân hơn. Khắc chế Trường xà.' },
    nhanhanh: { name: 'Nhạn hành trận', atk: 1.0, def: 0.95, spd: 1.0, beats: 'phuong', desc: 'Hàng ngang tên bắn. Cung thủ +35%. Khắc chế Phương trận.' },
    truongxa: { name: 'Trường xà trận', atk: 0.95, def: 0.9, spd: 1.25, beats: 'hacdy', desc: 'Rắn dài hành quân. Tốc độ +25%. Khắc chế Hạc dực.' },
  };
  CW.FORMATION_KEYS = Object.keys(CW.FORMATIONS);

  CW.STANCES = {
    aggr: { name: 'Chủ động', desc: 'Tự truy kích quân địch trong tầm 6 ô' },
    def: { name: 'Phòng thủ', desc: 'Chỉ đánh khi bị tấn công, phòng thủ +10%' },
    ambush: { name: 'Mai phục', desc: 'Đứng yên ở rừng/đồi ≥3 ngày: 3 ngày đầu giao chiến sát thương +60%' },
  };

  CW.TACTICS = {
    fire: { name: 'Hỏa công', stat: 'int', cd: 45, desc: 'Phóng hỏa thiêu doanh trại địch (dựa Trí lực)' },
    charge: { name: 'Đột kích', stat: 'war', cd: 40, desc: 'Kỵ binh xung phong (cần kỵ binh, dựa Võ lực)' },
    taunt: { name: 'Khích tướng', stat: 'int', cd: 35, desc: 'Làm lung lay sĩ khí địch' },
    rally: { name: 'Cổ vũ', stat: 'lead', cd: 30, desc: 'Hồi phục sĩ khí quân ta (dựa Thống soái)' },
  };

  CW.BUILDINGS = {
    farm: { name: 'Nông điền', icon: '🌾', desc: '+30% lương thực / cấp', base: { gold: 110, wood: 50 }, days: 30 },
    market: { name: 'Thị tứ', icon: '💰', desc: '+30% thuế / cấp', base: { gold: 140, wood: 50 }, days: 30 },
    lumber: { name: 'Lâm trường', icon: '🌲', desc: '+40% gỗ / cấp', base: { gold: 80, wood: 20 }, days: 20 },
    mine: { name: 'Khoáng sơn', icon: '⛏', desc: '+40% sắt / cấp (tốt ở vùng đồi núi)', base: { gold: 130, wood: 60 }, days: 35 },
    smithy: { name: 'Xưởng binh khí', icon: '⚒', desc: 'Rèn 45 binh khí/tháng mỗi cấp (tốn 30 sắt + 15 gỗ)', base: { gold: 150, wood: 80, iron: 30 }, days: 35 },
    barracks: { name: 'Doanh trại', icon: '⛺', desc: 'Huấn luyện nhanh hơn 15%, giảm 8% chi phí mộ binh / cấp', base: { gold: 140, wood: 100 }, days: 30 },
    wall: { name: 'Thành lũy', icon: '🏯', desc: '+150 độ bền tường, tăng sức thủ thành / cấp', base: { gold: 170, wood: 110, iron: 20 }, days: 45 },
  };
  CW.BUILD_KEYS = Object.keys(CW.BUILDINGS);
  CW.MAX_BLD = 5;

  CW.RES = {
    food: { name: 'Lương thực', icon: '🌾' },
    gold: { name: 'Ngân khố', icon: '💰' },
    wood: { name: 'Gỗ', icon: '🌲' },
    iron: { name: 'Sắt', icon: '⛏' },
    weapons: { name: 'Binh khí', icon: '⚔' },
  };
  CW.RES_KEYS = Object.keys(CW.RES);

  // Các nước có sẵn (AI)
  CW.NATION_PRESETS = [
    { id: 'ngo', name: 'Ngô', char: '吳', color: '#7d8fa6', monarch: 'Ngô Vương Phù Sai', aggr: 0.6, comp: [0.45, 0.35, 0.1, 0.1] },
    { id: 'viet', name: 'Việt', char: '越', color: '#d9b346', monarch: 'Việt Vương Câu Tiễn', aggr: 0.7, comp: [0.55, 0.25, 0.1, 0.1] },
    { id: 'so', name: 'Sở', char: '楚', color: '#c9783a', monarch: 'Sở Trang Vương', aggr: 0.75, comp: [0.5, 0.2, 0.2, 0.1] },
    { id: 'trieu', name: 'Triệu', char: '趙', color: '#8f5aa8', monarch: 'Triệu Vũ Linh Vương', aggr: 0.7, comp: [0.3, 0.2, 0.42, 0.08] },
    { id: 'yen', name: 'Yên', char: '燕', color: '#5e9a62', monarch: 'Yên Chiêu Vương', aggr: 0.45, comp: [0.45, 0.25, 0.22, 0.08] },
    { id: 'han', name: 'Hàn', char: '韓', color: '#b8574e', monarch: 'Hàn Tuyên Huệ Vương', aggr: 0.4, comp: [0.45, 0.35, 0.1, 0.1] },
    { id: 'nguy', name: 'Ngụy', char: '魏', color: '#4f7fb8', monarch: 'Ngụy Văn Hầu', aggr: 0.65, comp: [0.5, 0.2, 0.18, 0.12] },
    { id: 'man', name: 'Mân', char: '閩', color: '#c46a8a', monarch: 'Mân Việt Vương Vô Chư', aggr: 0.4, comp: [0.55, 0.3, 0.05, 0.1] },
    { id: 'lo', name: 'Lỗ', char: '魯', color: '#a58f55', monarch: 'Lỗ Ai Công', aggr: 0.3, comp: [0.5, 0.3, 0.1, 0.1] },
    { id: 'aulac', name: 'Âu Lạc', char: '甌', color: '#3f9a8f', monarch: 'An Dương Vương', aggr: 0.5, comp: [0.4, 0.45, 0.05, 0.1] },
    { id: 'mien', name: 'Miên', char: '緬', color: '#9a6b3f', monarch: 'Miên Vương Phù Nam', aggr: 0.5, comp: [0.5, 0.3, 0.12, 0.08] },
    { id: 'te', name: 'Tề', char: '齊', color: '#a9a83c', monarch: 'Tề Hoàn Công', aggr: 0.55, comp: [0.45, 0.25, 0.2, 0.1] },
    { id: 'tan', name: 'Tần', char: '秦', color: '#5d636e', monarch: 'Tần Chiêu Tương Vương', aggr: 0.85, comp: [0.45, 0.25, 0.2, 0.1] },
  ];

  CW.MAP_TEMPLATES = [
    { id: 'trungdia', name: 'Trung Địa', desc: 'Đại lục rộng lớn, biển Đông bao bọc phía đông và nam, núi non trùng điệp phía tây.' },
    { id: 'thatquoc', name: 'Thất Quốc Tranh Hùng', desc: 'Đồng bằng mênh mông, hồ lớn ở trung tâm, các dãy núi chia cắt chư hầu.' },
    { id: 'giangnam', name: 'Giang Nam Thủy Quốc', desc: 'Sông ngòi chằng chịt, hồ đầm khắp nơi, biển phía đông nam.' },
    { id: 'bandao', name: 'Đông Hải Bán Đảo', desc: 'Vịnh biển lớn ăn sâu vào đất liền, hai bán đảo hai bên.' },
    { id: 'taivuc', name: 'Tây Vực Đại Mạc', desc: 'Sa mạc phía tây, thảo nguyên phía bắc, đồng bằng phì nhiêu phía đông.' },
    { id: 'cuuchau', name: 'Cửu Châu Đại Lục', desc: 'Một đại lục bị biển bao quanh bốn phía.' },
  ];

  // income: hệ số thu nhập AI · aggr: độ hiếu chiến AI · troops: hệ số quân số mục tiêu của AI
  // grace: số ngày đầu AI không tuyên chiến với người chơi · pInc: hệ số thu nhập người chơi
  // vsPlayer: hệ số xác suất AI chọn người chơi làm mục tiêu · relP: quan hệ phải thấp hơn mức này AI mới đánh người chơi
  CW.DIFFICULTY = {
    easy: { name: 'Dễ', income: 0.8, aggr: 0.75, troops: 0.75, grace: 720, pInc: 1.2, vsPlayer: 0.4, relP: -15 },
    normal: { name: 'Thường', income: 0.9, aggr: 0.9, troops: 0.8, grace: 360, pInc: 1.05, vsPlayer: 0.75, relP: 0 },
    hard: { name: 'Khó', income: 1.15, aggr: 1.2, troops: 1.05, grace: 180, pInc: 1.0, vsPlayer: 1.0, relP: 15 },
  };
  CW.diff = g => CW.DIFFICULTY[g.setup.difficulty] || CW.DIFFICULTY.normal;

  CW.PROVINCE_NAMES = ['Trường An', 'Lạc Dương', 'Biện Lương', 'Hàm Dương', 'Kiến Nghiệp', 'Cối Kê', 'Thọ Xuân', 'Dĩnh Đô', 'Hàm Đan', 'Kế Thành',
    'Đại Lương', 'Tân Trịnh', 'Lâm Truy', 'Khúc Phụ', 'Cô Tô', 'Phiên Ngung', 'Cổ Loa', 'Mê Linh', 'Giao Chỉ', 'Uyển Thành',
    'Hứa Xương', 'Tương Dương', 'Giang Lăng', 'Thành Đô', 'Hán Trung', 'Thượng Đảng', 'Tấn Dương', 'Thái Nguyên', 'Nghiệp Thành', 'Ký Châu',
    'Thanh Châu', 'Từ Châu', 'Dương Châu', 'Kinh Châu', 'Ích Châu', 'Lương Châu', 'U Châu', 'Liêu Đông', 'Nam Hải', 'Quế Lâm',
    'Tượng Quận', 'Cửu Chân', 'Nhật Nam', 'Mân Trung', 'Kiến An', 'Dự Chương', 'Trường Sa', 'Linh Lăng', 'Vũ Lăng', 'Ba Quận',
    'Thục Quận', 'Lũng Tây', 'Thiên Thủy', 'Hà Đông', 'Hà Nội', 'Hà Gian', 'Bột Hải', 'Tế Nam', 'Lang Gia', 'Đông Hải',
    'Đan Dương', 'Lư Giang', 'Cửu Giang', 'Nhữ Nam', 'Dĩnh Xuyên', 'Nam Dương', 'Trần Lưu', 'Bộc Dương', 'Hạ Phì', 'Quảng Lăng',
    'Bành Thành', 'Thượng Dung', 'Vũ Uy', 'Trương Dịch', 'Tửu Tuyền', 'Đôn Hoàng', 'Nhạn Môn', 'Đại Quận', 'Vân Trung', 'Ngư Dương',
    'Hữu Bắc Bình', 'Liêu Tây', 'Lạc Lãng', 'Đông Lai', 'Bắc Hải', 'Thái Sơn', 'Lỗ Quận', 'Bái Quận', 'Lương Quốc', 'Trần Quốc',
    'Toánh Xuyên', 'Hoằng Nông', 'Kinh Triệu', 'Phù Phong', 'Phùng Dực', 'Vĩnh Xương', 'Tang Kha', 'Kiến Ninh', 'Việt Thường', 'Uất Lâm'];

  CW.SURNAMES = ['Lý', 'Trương', 'Triệu', 'Vương', 'Lưu', 'Tôn', 'Tào', 'Hạng', 'Hàn', 'Bạch', 'Liêm', 'Lạn', 'Mông', 'Chu', 'Ngũ', 'Phạm',
    'Tô', 'Trần', 'Hoàng', 'Quan', 'Mã', 'Hạ Hầu', 'Gia Cát', 'Tư Mã', 'Âu Dương', 'Công Tôn', 'Úy Trì', 'Nhạc', 'Đặng', 'Khuất', 'Điền',
    'Lã', 'Từ', 'Cam', 'Thái Sử', 'Hứa', 'Văn', 'Bàng', 'Khương', 'Ngụy', 'Tần', 'Đổng', 'Viên', 'Lục', 'Trình', 'Hoắc', 'Vệ', 'Cao'];
  CW.GIVEN = ['Khởi', 'Tiễn', 'Mục', 'Phá', 'Vũ', 'Tín', 'Bá', 'Quân', 'Sùng', 'Hiển', 'Uy', 'Dũng', 'Lương', 'Trung', 'Nghĩa', 'Văn',
    'Hùng', 'Kiệt', 'Tử Long', 'Tử Tư', 'Điềm', 'Trọng', 'Thúc', 'Khang', 'Thành', 'Đức', 'Phong', 'Liệt', 'Bố', 'Siêu', 'Hoàng', 'Duy',
    'Thịnh', 'Ngạn', 'Toàn', 'Kính', 'Lăng', 'Quang', 'Nhân', 'Minh', 'Khải', 'Định', 'Tuấn', 'Hạo', 'Viễn', 'Chiêu', 'Dực', 'Hưng'];

  CW.TITLES = ['Hoàng đế', 'Vương', 'Công', 'Hầu', 'Thiên tử'];
  CW.NEUTRAL_COLOR = '#b9ab8c';
})();
