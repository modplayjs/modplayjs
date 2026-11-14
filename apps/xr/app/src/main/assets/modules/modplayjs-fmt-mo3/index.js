// ../../packages/fmt-mo3/src/mo3.ts
import { ParseError, PeriodType, C4_NTSC_RATE } from "@modplayjs/core";
import {
  FX_ARPEGGIO,
  FX_PORTA_UP,
  FX_PORTA_DN,
  FX_TONEPORTA,
  FX_VIBRATO,
  FX_TONE_VSLIDE,
  FX_VIBRA_VSLIDE,
  FX_TREMOLO,
  FX_SETPAN,
  FX_OFFSET,
  FX_VOLSLIDE,
  FX_JUMP,
  FX_VOLSET,
  FX_BREAK,
  FX_EXTENDED,
  FX_SPEED,
  FX_GLOBALVOL,
  FX_GVOL_SLIDE,
  FX_KEYOFF,
  FX_ENVPOS,
  FX_PANSLIDE,
  FX_MULTI_RETRIG,
  FX_TREMOR,
  FX_XF_PORTA,
  FX_TRK_VOL,
  FX_TRK_VSLIDE,
  FX_IT_BPM,
  FX_PANBRELLO,
  FX_MACRO,
  FX_FINE_VIBRATO
} from "@modplayjs/core";
import { ReadEventType } from "@modplayjs/core";

// ../../packages/fmt-mo3/src/mo3LZ.ts
var consumed = 8;
function lastConsumed() {
  return consumed;
}
function depackMO3Music(bytes) {
  const buf = bytes;
  const version = buf[3];
  const musicSize = (buf[4] | buf[5] << 8 | buf[6] << 16 | buf[7] << 24) >>> 0;
  let pos = version >= 5 ? 12 : 8;
  const out = new Uint8Array(musicSize);
  let outPos = 0;
  let data = 0, carry = 0, strLen = 0, strOffset = 0;
  void version;
  let broken = false;
  const readByte = () => pos < buf.length ? buf[pos++] : null;
  const readCtrlBit = () => {
    data <<= 1;
    carry = data > 255 ? 1 : 0;
    data &= 255;
    if (data === 0) {
      const nb = readByte();
      if (nb === null) return false;
      data = nb;
      data = (data << 1) + 1;
      carry = data > 255 ? 1 : 0;
      data &= 255;
    }
    return true;
  };
  if (musicSize === 0) {
    consumed = pos;
    return out;
  }
  {
    const b = readByte();
    if (b === null) {
      consumed = pos;
      return out;
    }
    out[outPos++] = b;
  }
  if (strLen > 0) {
    let copyLen = Math.min(strLen, musicSize - outPos);
    const srcStart = outPos + strOffset;
    for (let i = 0; i < copyLen; i++) out[outPos + i] = out[srcStart + i];
    outPos += copyLen;
    strLen -= copyLen;
  }
  while (outPos < musicSize && !broken) {
    if (!readCtrlBit()) {
      broken = true;
      break;
    }
    if (!carry) {
      const b = readByte();
      if (b === null) {
        broken = true;
        break;
      }
      out[outPos++] = b;
    } else {
      let lengthAdjust = 0;
      strLen++;
      let ok = true;
      do {
        if (!readCtrlBit()) {
          ok = false;
          break;
        }
        strLen = (strLen << 1) + carry;
        if (!readCtrlBit()) {
          ok = false;
          break;
        }
      } while (carry);
      if (!ok) {
        broken = true;
        break;
      }
      strLen -= 3;
      if (strLen < 0) {
        strLen++;
      } else {
        const b = readByte();
        if (b === null) {
          broken = true;
          break;
        }
        strOffset = strLen << 8 | b;
        strLen = 0;
        strOffset = ~strOffset;
        if (strOffset < -1280) lengthAdjust++;
        lengthAdjust++;
        if (strOffset < -32e3) lengthAdjust++;
      }
      if (strOffset >= 0 || -outPos > strOffset) {
        broken = true;
        break;
      }
      if (!readCtrlBit()) {
        broken = true;
        break;
      }
      strLen = (strLen << 1) + carry;
      if (!readCtrlBit()) {
        broken = true;
        break;
      }
      strLen = (strLen << 1) + carry;
      if (strLen === 0) {
        strLen++;
        do {
          if (!readCtrlBit()) {
            ok = false;
            break;
          }
          strLen = (strLen << 1) + carry;
          if (!readCtrlBit()) {
            ok = false;
            break;
          }
        } while (carry);
        if (!ok) {
          broken = true;
          break;
        }
        strLen += 2;
      }
      strLen += lengthAdjust;
      if (strLen <= 0 || musicSize - outPos < strLen) {
        broken = true;
        break;
      }
      let copyLen = Math.min(strLen, musicSize - outPos);
      const srcStart = outPos + strOffset;
      for (let i = 0; i < copyLen; i++) {
        out[outPos + i] = out[srcStart + i];
      }
      outPos += copyLen;
      strLen -= copyLen;
      if (strLen > 0 && outPos < musicSize) {
        let copyLen2 = Math.min(strLen, musicSize - outPos);
        const srcStart2 = outPos + strOffset;
        for (let i = 0; i < copyLen2; i++) out[outPos + i] = out[srcStart2 + i];
        outPos += copyLen2;
        strLen -= copyLen2;
      }
    }
  }
  consumed = pos;
  return out;
}

// ../../packages/fmt-mo3/src/mpegFrame.ts
var SAMPLES_PER_FRAME = [
  [384, 1152, 1152],
  // MPEG 1
  [384, 1152, 576]
  // MPEG 2 / 2.5
];
var BIT_RATES = [
  // MPEG 1
  [
    [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    // Layer 1
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    // Layer 2
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    // Layer 3
  ],
  // MPEG 2 / 2.5
  [
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    // Layer 1
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    // Layer 2
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    // Layer 3
  ]
];
var SAMPLING_RATES = [
  [11025, 12e3, 8e3],
  // MPEG 2.5
  [0, 0, 0],
  // Invalid
  [22050, 24e3, 16e3],
  // MPEG 2
  [44100, 48e3, 32e3]
  // MPEG 1
];
var SIDE_INFO_SIZE = [
  [17, 32],
  // MPEG 1
  [9, 17]
  // MPEG 2 / 2.5
];
function isMPEGHeader(header, off = 0) {
  return header[off] === 255 && (header[off + 1] & 224) === 224 && // Sync
  (header[off + 1] & 24) !== 8 && // Invalid MPEG version
  (header[off + 1] & 6) !== 0 && // Invalid MPEG layer
  (header[off + 2] & 12) !== 12 && // Invalid frequency
  (header[off + 2] & 240) !== 240;
}
function parseMPEGFrame(data, off = 0) {
  if (off + 4 > data.length || !isMPEGHeader(data, off)) return null;
  const b1 = data[off + 1];
  const b2 = data[off + 2];
  const mpegVersion = (b1 & 24) >> 3;
  const layer = 3 - ((b1 & 6) >> 1);
  const bitrateIndex = (b2 & 240) >> 4;
  const samplerateIndex = (b2 & 12) >> 2;
  const padding = (b2 & 2) >> 1;
  const mpegId = mpegVersion === 3 ? 0 : 1;
  const sampleRate = SAMPLING_RATES[mpegVersion][samplerateIndex];
  if (sampleRate === 0) return null;
  const bitRate = BIT_RATES[mpegId][layer][bitrateIndex] * 1e3 / 8;
  const frameSize = Math.floor(bitRate * SAMPLES_PER_FRAME[mpegId][layer] / sampleRate) + padding;
  const numSamples = SAMPLES_PER_FRAME[mpegId][layer];
  let isLAME = false;
  if (layer === 2) {
    const sideInfo = SIDE_INFO_SIZE[mpegId][mpegId === 0 ? 1 : 0];
    const magicOff = off + 4 + sideInfo;
    if (magicOff + 4 <= data.length) {
      const magic = String.fromCharCode(data[magicOff], data[magicOff + 1], data[magicOff + 2], data[magicOff + 3]);
      if (magic === "Xing" || magic === "Info") isLAME = true;
    }
  }
  return { frameSize, numSamples, sampleRate, isLAME };
}

// ../../packages/fmt-mo3/src/mp3tables.ts
var TABS = new Int16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 785, 785, 785, 785, 784, 784, 784, 784, 513, 513, 513, 513, 513, 513, 513, 513, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, -255, 1313, 1298, 1282, 785, 785, 785, 785, 784, 784, 784, 784, 769, 769, 769, 769, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 290, 288, -255, 1313, 1298, 1282, 769, 769, 769, 769, 529, 529, 529, 529, 529, 529, 529, 529, 528, 528, 528, 528, 528, 528, 528, 528, 512, 512, 512, 512, 512, 512, 512, 512, 290, 288, -253, -318, -351, -367, 785, 785, 785, 785, 784, 784, 784, 784, 769, 769, 769, 769, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 819, 818, 547, 547, 275, 275, 275, 275, 561, 560, 515, 546, 289, 274, 288, 258, -254, -287, 1329, 1299, 1314, 1312, 1057, 1057, 1042, 1042, 1026, 1026, 784, 784, 784, 784, 529, 529, 529, 529, 529, 529, 529, 529, 769, 769, 769, 769, 768, 768, 768, 768, 563, 560, 306, 306, 291, 259, -252, -413, -477, -542, 1298, -575, 1041, 1041, 784, 784, 784, 784, 769, 769, 769, 769, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, -383, -399, 1107, 1092, 1106, 1061, 849, 849, 789, 789, 1104, 1091, 773, 773, 1076, 1075, 341, 340, 325, 309, 834, 804, 577, 577, 532, 532, 516, 516, 832, 818, 803, 816, 561, 561, 531, 531, 515, 546, 289, 289, 288, 258, -252, -429, -493, -559, 1057, 1057, 1042, 1042, 529, 529, 529, 529, 529, 529, 529, 529, 784, 784, 784, 784, 769, 769, 769, 769, 512, 512, 512, 512, 512, 512, 512, 512, -382, 1077, -415, 1106, 1061, 1104, 849, 849, 789, 789, 1091, 1076, 1029, 1075, 834, 834, 597, 581, 340, 340, 339, 324, 804, 833, 532, 532, 832, 772, 818, 803, 817, 787, 816, 771, 290, 290, 290, 290, 288, 258, -253, -349, -414, -447, -463, 1329, 1299, -479, 1314, 1312, 1057, 1057, 1042, 1042, 1026, 1026, 785, 785, 785, 785, 784, 784, 784, 784, 769, 769, 769, 769, 768, 768, 768, 768, -319, 851, 821, -335, 836, 850, 805, 849, 341, 340, 325, 336, 533, 533, 579, 579, 564, 564, 773, 832, 578, 548, 563, 516, 321, 276, 306, 291, 304, 259, -251, -572, -733, -830, -863, -879, 1041, 1041, 784, 784, 784, 784, 769, 769, 769, 769, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, -511, -527, -543, 1396, 1351, 1381, 1366, 1395, 1335, 1380, -559, 1334, 1138, 1138, 1063, 1063, 1350, 1392, 1031, 1031, 1062, 1062, 1364, 1363, 1120, 1120, 1333, 1348, 881, 881, 881, 881, 375, 374, 359, 373, 343, 358, 341, 325, 791, 791, 1123, 1122, -703, 1105, 1045, -719, 865, 865, 790, 790, 774, 774, 1104, 1029, 338, 293, 323, 308, -799, -815, 833, 788, 772, 818, 803, 816, 322, 292, 307, 320, 561, 531, 515, 546, 289, 274, 288, 258, -251, -525, -605, -685, -765, -831, -846, 1298, 1057, 1057, 1312, 1282, 785, 785, 785, 785, 784, 784, 784, 784, 769, 769, 769, 769, 512, 512, 512, 512, 512, 512, 512, 512, 1399, 1398, 1383, 1367, 1382, 1396, 1351, -511, 1381, 1366, 1139, 1139, 1079, 1079, 1124, 1124, 1364, 1349, 1363, 1333, 882, 882, 882, 882, 807, 807, 807, 807, 1094, 1094, 1136, 1136, 373, 341, 535, 535, 881, 775, 867, 822, 774, -591, 324, 338, -671, 849, 550, 550, 866, 864, 609, 609, 293, 336, 534, 534, 789, 835, 773, -751, 834, 804, 308, 307, 833, 788, 832, 772, 562, 562, 547, 547, 305, 275, 560, 515, 290, 290, -252, -397, -477, -557, -622, -653, -719, -735, -750, 1329, 1299, 1314, 1057, 1057, 1042, 1042, 1312, 1282, 1024, 1024, 785, 785, 785, 785, 784, 784, 784, 784, 769, 769, 769, 769, -383, 1127, 1141, 1111, 1126, 1140, 1095, 1110, 869, 869, 883, 883, 1079, 1109, 882, 882, 375, 374, 807, 868, 838, 881, 791, -463, 867, 822, 368, 263, 852, 837, 836, -543, 610, 610, 550, 550, 352, 336, 534, 534, 865, 774, 851, 821, 850, 805, 593, 533, 579, 564, 773, 832, 578, 578, 548, 548, 577, 577, 307, 276, 306, 291, 516, 560, 259, 259, -250, -2107, -2507, -2764, -2909, -2974, -3007, -3023, 1041, 1041, 1040, 1040, 769, 769, 769, 769, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, -767, -1052, -1213, -1277, -1358, -1405, -1469, -1535, -1550, -1582, -1614, -1647, -1662, -1694, -1726, -1759, -1774, -1807, -1822, -1854, -1886, 1565, -1919, -1935, -1951, -1967, 1731, 1730, 1580, 1717, -1983, 1729, 1564, -1999, 1548, -2015, -2031, 1715, 1595, -2047, 1714, -2063, 1610, -2079, 1609, -2095, 1323, 1323, 1457, 1457, 1307, 1307, 1712, 1547, 1641, 1700, 1699, 1594, 1685, 1625, 1442, 1442, 1322, 1322, -780, -973, -910, 1279, 1278, 1277, 1262, 1276, 1261, 1275, 1215, 1260, 1229, -959, 974, 974, 989, 989, -943, 735, 478, 478, 495, 463, 506, 414, -1039, 1003, 958, 1017, 927, 942, 987, 957, 431, 476, 1272, 1167, 1228, -1183, 1256, -1199, 895, 895, 941, 941, 1242, 1227, 1212, 1135, 1014, 1014, 490, 489, 503, 487, 910, 1013, 985, 925, 863, 894, 970, 955, 1012, 847, -1343, 831, 755, 755, 984, 909, 428, 366, 754, 559, -1391, 752, 486, 457, 924, 997, 698, 698, 983, 893, 740, 740, 908, 877, 739, 739, 667, 667, 953, 938, 497, 287, 271, 271, 683, 606, 590, 712, 726, 574, 302, 302, 738, 736, 481, 286, 526, 725, 605, 711, 636, 724, 696, 651, 589, 681, 666, 710, 364, 467, 573, 695, 466, 466, 301, 465, 379, 379, 709, 604, 665, 679, 316, 316, 634, 633, 436, 436, 464, 269, 424, 394, 452, 332, 438, 363, 347, 408, 393, 448, 331, 422, 362, 407, 392, 421, 346, 406, 391, 376, 375, 359, 1441, 1306, -2367, 1290, -2383, 1337, -2399, -2415, 1426, 1321, -2431, 1411, 1336, -2447, -2463, -2479, 1169, 1169, 1049, 1049, 1424, 1289, 1412, 1352, 1319, -2495, 1154, 1154, 1064, 1064, 1153, 1153, 416, 390, 360, 404, 403, 389, 344, 374, 373, 343, 358, 372, 327, 357, 342, 311, 356, 326, 1395, 1394, 1137, 1137, 1047, 1047, 1365, 1392, 1287, 1379, 1334, 1364, 1349, 1378, 1318, 1363, 792, 792, 792, 792, 1152, 1152, 1032, 1032, 1121, 1121, 1046, 1046, 1120, 1120, 1030, 1030, -2895, 1106, 1061, 1104, 849, 849, 789, 789, 1091, 1076, 1029, 1090, 1060, 1075, 833, 833, 309, 324, 532, 532, 832, 772, 818, 803, 561, 561, 531, 560, 515, 546, 289, 274, 288, 258, -250, -1179, -1579, -1836, -1996, -2124, -2253, -2333, -2413, -2477, -2542, -2574, -2607, -2622, -2655, 1314, 1313, 1298, 1312, 1282, 785, 785, 785, 785, 1040, 1040, 1025, 1025, 768, 768, 768, 768, -766, -798, -830, -862, -895, -911, -927, -943, -959, -975, -991, -1007, -1023, -1039, -1055, -1070, 1724, 1647, -1103, -1119, 1631, 1767, 1662, 1738, 1708, 1723, -1135, 1780, 1615, 1779, 1599, 1677, 1646, 1778, 1583, -1151, 1777, 1567, 1737, 1692, 1765, 1722, 1707, 1630, 1751, 1661, 1764, 1614, 1736, 1676, 1763, 1750, 1645, 1598, 1721, 1691, 1762, 1706, 1582, 1761, 1566, -1167, 1749, 1629, 767, 766, 751, 765, 494, 494, 735, 764, 719, 749, 734, 763, 447, 447, 748, 718, 477, 506, 431, 491, 446, 476, 461, 505, 415, 430, 475, 445, 504, 399, 460, 489, 414, 503, 383, 474, 429, 459, 502, 502, 746, 752, 488, 398, 501, 473, 413, 472, 486, 271, 480, 270, -1439, -1455, 1357, -1471, -1487, -1503, 1341, 1325, -1519, 1489, 1463, 1403, 1309, -1535, 1372, 1448, 1418, 1476, 1356, 1462, 1387, -1551, 1475, 1340, 1447, 1402, 1386, -1567, 1068, 1068, 1474, 1461, 455, 380, 468, 440, 395, 425, 410, 454, 364, 467, 466, 464, 453, 269, 409, 448, 268, 432, 1371, 1473, 1432, 1417, 1308, 1460, 1355, 1446, 1459, 1431, 1083, 1083, 1401, 1416, 1458, 1445, 1067, 1067, 1370, 1457, 1051, 1051, 1291, 1430, 1385, 1444, 1354, 1415, 1400, 1443, 1082, 1082, 1173, 1113, 1186, 1066, 1185, 1050, -1967, 1158, 1128, 1172, 1097, 1171, 1081, -1983, 1157, 1112, 416, 266, 375, 400, 1170, 1142, 1127, 1065, 793, 793, 1169, 1033, 1156, 1096, 1141, 1111, 1155, 1080, 1126, 1140, 898, 898, 808, 808, 897, 897, 792, 792, 1095, 1152, 1032, 1125, 1110, 1139, 1079, 1124, 882, 807, 838, 881, 853, 791, -2319, 867, 368, 263, 822, 852, 837, 866, 806, 865, -2399, 851, 352, 262, 534, 534, 821, 836, 594, 594, 549, 549, 593, 593, 533, 533, 848, 773, 579, 579, 564, 578, 548, 563, 276, 276, 577, 576, 306, 291, 516, 560, 305, 305, 275, 259, -251, -892, -2058, -2620, -2828, -2957, -3023, -3039, 1041, 1041, 1040, 1040, 769, 769, 769, 769, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, 256, -511, -527, -543, -559, 1530, -575, -591, 1528, 1527, 1407, 1526, 1391, 1023, 1023, 1023, 1023, 1525, 1375, 1268, 1268, 1103, 1103, 1087, 1087, 1039, 1039, 1523, -604, 815, 815, 815, 815, 510, 495, 509, 479, 508, 463, 507, 447, 431, 505, 415, 399, -734, -782, 1262, -815, 1259, 1244, -831, 1258, 1228, -847, -863, 1196, -879, 1253, 987, 987, 748, -767, 493, 493, 462, 477, 414, 414, 686, 669, 478, 446, 461, 445, 474, 429, 487, 458, 412, 471, 1266, 1264, 1009, 1009, 799, 799, -1019, -1276, -1452, -1581, -1677, -1757, -1821, -1886, -1933, -1997, 1257, 1257, 1483, 1468, 1512, 1422, 1497, 1406, 1467, 1496, 1421, 1510, 1134, 1134, 1225, 1225, 1466, 1451, 1374, 1405, 1252, 1252, 1358, 1480, 1164, 1164, 1251, 1251, 1238, 1238, 1389, 1465, -1407, 1054, 1101, -1423, 1207, -1439, 830, 830, 1248, 1038, 1237, 1117, 1223, 1148, 1236, 1208, 411, 426, 395, 410, 379, 269, 1193, 1222, 1132, 1235, 1221, 1116, 976, 976, 1192, 1162, 1177, 1220, 1131, 1191, 963, 963, -1647, 961, 780, -1663, 558, 558, 994, 993, 437, 408, 393, 407, 829, 978, 813, 797, 947, -1743, 721, 721, 377, 392, 844, 950, 828, 890, 706, 706, 812, 859, 796, 960, 948, 843, 934, 874, 571, 571, -1919, 690, 555, 689, 421, 346, 539, 539, 944, 779, 918, 873, 932, 842, 903, 888, 570, 570, 931, 917, 674, 674, -2575, 1562, -2591, 1609, -2607, 1654, 1322, 1322, 1441, 1441, 1696, 1546, 1683, 1593, 1669, 1624, 1426, 1426, 1321, 1321, 1639, 1680, 1425, 1425, 1305, 1305, 1545, 1668, 1608, 1623, 1667, 1592, 1638, 1666, 1320, 1320, 1652, 1607, 1409, 1409, 1304, 1304, 1288, 1288, 1664, 1637, 1395, 1395, 1335, 1335, 1622, 1636, 1394, 1394, 1319, 1319, 1606, 1621, 1392, 1392, 1137, 1137, 1137, 1137, 345, 390, 360, 375, 404, 373, 1047, -2751, -2767, -2783, 1062, 1121, 1046, -2799, 1077, -2815, 1106, 1061, 789, 789, 1105, 1104, 263, 355, 310, 340, 325, 354, 352, 262, 339, 324, 1091, 1076, 1029, 1090, 1060, 1075, 833, 833, 788, 788, 1088, 1028, 818, 818, 803, 803, 561, 561, 531, 531, 816, 771, 546, 546, 289, 274, 288, 258, -253, -317, -381, -446, -478, -509, 1279, 1279, -811, -1179, -1451, -1756, -1900, -2028, -2189, -2253, -2333, -2414, -2445, -2511, -2526, 1313, 1298, -2559, 1041, 1041, 1040, 1040, 1025, 1025, 1024, 1024, 1022, 1007, 1021, 991, 1020, 975, 1019, 959, 687, 687, 1018, 1017, 671, 671, 655, 655, 1016, 1015, 639, 639, 758, 758, 623, 623, 757, 607, 756, 591, 755, 575, 754, 559, 543, 543, 1009, 783, -575, -621, -685, -749, 496, -590, 750, 749, 734, 748, 974, 989, 1003, 958, 988, 973, 1002, 942, 987, 957, 972, 1001, 926, 986, 941, 971, 956, 1e3, 910, 985, 925, 999, 894, 970, -1071, -1087, -1102, 1390, -1135, 1436, 1509, 1451, 1374, -1151, 1405, 1358, 1480, 1420, -1167, 1507, 1494, 1389, 1342, 1465, 1435, 1450, 1326, 1505, 1310, 1493, 1373, 1479, 1404, 1492, 1464, 1419, 428, 443, 472, 397, 736, 526, 464, 464, 486, 457, 442, 471, 484, 482, 1357, 1449, 1434, 1478, 1388, 1491, 1341, 1490, 1325, 1489, 1463, 1403, 1309, 1477, 1372, 1448, 1418, 1433, 1476, 1356, 1462, 1387, -1439, 1475, 1340, 1447, 1402, 1474, 1324, 1461, 1371, 1473, 269, 448, 1432, 1417, 1308, 1460, -1711, 1459, -1727, 1441, 1099, 1099, 1446, 1386, 1431, 1401, -1743, 1289, 1083, 1083, 1160, 1160, 1458, 1445, 1067, 1067, 1370, 1457, 1307, 1430, 1129, 1129, 1098, 1098, 268, 432, 267, 416, 266, 400, -1887, 1144, 1187, 1082, 1173, 1113, 1186, 1066, 1050, 1158, 1128, 1143, 1172, 1097, 1171, 1081, 420, 391, 1157, 1112, 1170, 1142, 1127, 1065, 1169, 1049, 1156, 1096, 1141, 1111, 1155, 1080, 1126, 1154, 1064, 1153, 1140, 1095, 1048, -2159, 1125, 1110, 1137, -2175, 823, 823, 1139, 1138, 807, 807, 384, 264, 368, 263, 868, 838, 853, 791, 867, 822, 852, 837, 866, 806, 865, 790, -2319, 851, 821, 836, 352, 262, 850, 805, 849, -2399, 533, 533, 835, 820, 336, 261, 578, 548, 563, 577, 532, 532, 832, 772, 562, 562, 547, 547, 305, 275, 560, 515, 290, 290, 288, 258]);
var TAB32 = [130, 162, 193, 209, 44, 28, 76, 140, 9, 9, 9, 9, 9, 9, 9, 9, 190, 254, 222, 238, 126, 94, 157, 157, 109, 61, 173, 205];
var TAB33 = [252, 236, 220, 204, 188, 172, 156, 140, 124, 108, 92, 76, 60, 44, 28, 12];
var TABINDEX = [0, 32, 64, 98, 0, 132, 180, 218, 292, 364, 426, 538, 648, 746, 0, 1126, 1460, 1460, 1460, 1460, 1460, 1460, 1460, 1460, 1842, 1842, 1842, 1842, 1842, 1842, 1842, 1842];
var G_LINBITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 6, 8, 10, 13, 4, 5, 6, 7, 8, 9, 11, 13];
var G_SCF_LONG = [
  [6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 38, 46, 52, 60, 68, 58, 54, 0],
  [12, 12, 12, 12, 12, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 76, 90, 2, 2, 2, 2, 2, 0],
  [6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 38, 46, 52, 60, 68, 58, 54, 0],
  [6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16, 18, 22, 26, 32, 38, 46, 54, 62, 70, 76, 36, 0],
  [6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 38, 46, 52, 60, 68, 58, 54, 0],
  [4, 4, 4, 4, 4, 4, 6, 6, 8, 8, 10, 12, 16, 20, 24, 28, 34, 42, 50, 54, 76, 158, 0],
  [4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 10, 12, 16, 18, 22, 28, 34, 40, 46, 54, 54, 192, 0],
  [4, 4, 4, 4, 4, 4, 6, 6, 8, 10, 12, 16, 20, 24, 30, 38, 46, 56, 68, 84, 102, 26, 0]
];
var G_SCF_SHORT = [
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 24, 24, 24, 30, 30, 30, 40, 40, 40, 18, 18, 18, 0],
  [8, 8, 8, 8, 8, 8, 8, 8, 8, 12, 12, 12, 16, 16, 16, 20, 20, 20, 24, 24, 24, 28, 28, 28, 36, 36, 36, 2, 2, 2, 2, 2, 2, 2, 2, 2, 26, 26, 26, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 8, 8, 8, 10, 10, 10, 14, 14, 14, 18, 18, 18, 26, 26, 26, 32, 32, 32, 42, 42, 42, 18, 18, 18, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 24, 24, 24, 32, 32, 32, 44, 44, 44, 12, 12, 12, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 24, 24, 24, 30, 30, 30, 40, 40, 40, 18, 18, 18, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 22, 22, 22, 30, 30, 30, 56, 56, 56, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 10, 10, 10, 12, 12, 12, 14, 14, 14, 16, 16, 16, 20, 20, 20, 26, 26, 26, 66, 66, 66, 0],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 8, 8, 12, 12, 12, 16, 16, 16, 20, 20, 20, 26, 26, 26, 34, 34, 34, 42, 42, 42, 12, 12, 12, 0]
];
var G_SCF_MIXED = [
  [6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 24, 24, 24, 30, 30, 30, 40, 40, 40, 18, 18, 18, 0],
  [12, 12, 12, 4, 4, 4, 8, 8, 8, 12, 12, 12, 16, 16, 16, 20, 20, 20, 24, 24, 24, 28, 28, 28, 36, 36, 36, 2, 2, 2, 2, 2, 2, 2, 2, 2, 26, 26, 26, 0],
  [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 10, 10, 10, 14, 14, 14, 18, 18, 18, 26, 26, 26, 32, 32, 32, 42, 42, 42, 18, 18, 18, 0],
  [6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 24, 24, 24, 32, 32, 32, 44, 44, 44, 12, 12, 12, 0],
  [6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 24, 24, 24, 30, 30, 30, 40, 40, 40, 18, 18, 18, 0],
  [4, 4, 4, 4, 4, 4, 6, 6, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 18, 18, 18, 22, 22, 22, 30, 30, 30, 56, 56, 56, 0],
  [4, 4, 4, 4, 4, 4, 6, 6, 4, 4, 4, 6, 6, 6, 6, 6, 6, 10, 10, 10, 12, 12, 12, 14, 14, 14, 16, 16, 16, 20, 20, 20, 26, 26, 26, 66, 66, 66, 0],
  [4, 4, 4, 4, 4, 4, 6, 6, 4, 4, 4, 6, 6, 6, 8, 8, 8, 12, 12, 12, 16, 16, 16, 20, 20, 20, 26, 26, 26, 34, 34, 34, 42, 42, 42, 12, 12, 12, 0]
];
var G_SCF_PARTITIONS = [
  [6, 5, 5, 5, 6, 5, 5, 5, 6, 5, 7, 3, 11, 10, 0, 0, 7, 7, 7, 0, 6, 6, 6, 3, 8, 8, 5, 0],
  [8, 9, 6, 12, 6, 9, 9, 9, 6, 9, 12, 6, 15, 18, 0, 0, 6, 15, 12, 0, 6, 12, 9, 6, 6, 18, 9, 0],
  [9, 9, 6, 12, 9, 9, 9, 9, 9, 9, 12, 6, 18, 18, 0, 0, 12, 12, 12, 0, 12, 9, 9, 6, 15, 12, 9, 0]
];
var G_SCFC_DECODE = [0, 1, 2, 3, 12, 5, 6, 7, 9, 10, 11, 13, 14, 15, 18, 19];
var G_MOD = [5, 5, 4, 4, 5, 5, 4, 1, 4, 3, 1, 1, 5, 6, 6, 1, 4, 4, 4, 1, 4, 3, 1, 1];
var G_PREAMP = [1, 1, 1, 1, 2, 2, 3, 3, 3, 2];
var G_POW43 = [0, -1, -2.519842, -4.326749, -6.349604, -8.54988, -10.902724, -13.390518, -16, -18.720754, -21.544347, -24.463781, -27.473142, -30.567351, -33.741992, -36.993181, 0, 1, 2.519842, 4.326749, 6.349604, 8.54988, 10.902724, 13.390518, 16, 18.720754, 21.544347, 24.463781, 27.473142, 30.567351, 33.741992, 36.993181, 40.317474, 43.711787, 47.173345, 50.699631, 54.288352, 57.937408, 61.644865, 65.408941, 69.227979, 73.100443, 77.024898, 81, 85.024491, 89.097188, 93.216975, 97.3828, 101.593667, 105.848633, 110.146801, 114.487321, 118.869381, 123.292209, 127.755065, 132.257246, 136.798076, 141.376907, 145.993119, 150.646117, 155.335327, 160.060199, 164.820202, 169.614826, 174.443577, 179.30598, 184.201575, 189.129918, 194.09058, 199.083145, 204.10721, 209.162385, 214.248292, 219.364564, 224.510845, 229.686789, 234.892058, 240.126328, 245.38928, 250.680604, 256, 261.347174, 266.721841, 272.123723, 277.552547, 283.008049, 288.489971, 293.99806, 299.532071, 305.091761, 310.676898, 316.287249, 321.922592, 327.582707, 333.267377, 338.976394, 344.70955, 350.466646, 356.247482, 362.051866, 367.879608, 373.730522, 379.604427, 385.501143, 391.420496, 397.362314, 403.326427, 409.312672, 415.320884, 421.350905, 427.402579, 433.47575, 439.570269, 445.685987, 451.822757, 457.980436, 464.158883, 470.35796, 476.57753, 482.817459, 489.077615, 495.357868, 501.65809, 507.978156, 514.317941, 520.677324, 527.056184, 533.454404, 539.871867, 546.308458, 552.764065, 559.238575, 565.731879, 572.24387, 578.77444, 585.323483, 591.890898, 598.476581, 605.080431, 611.702349, 618.342238, 625, 631.67554, 638.368763, 645.079578];
var G_AA = [
  [0.85749293, 0.881742, 0.94962865, 0.98331459, 0.99551782, 0.99916056, 0.9998992, 0.99999316],
  [0.51449576, 0.47173197, 0.31337745, 0.1819132, 0.09457419, 0.04096558, 0.01419856, 369997e-8]
];
var G_MDCT_WINDOW = [
  [0.99904822, 0.99144486, 0.97629601, 0.95371695, 0.92387953, 0.88701083, 0.84339145, 0.79335334, 0.73727734, 0.04361938, 0.13052619, 0.21643961, 0.3007058, 0.38268343, 0.46174861, 0.53729961, 0.60876143, 0.67559021],
  [1, 1, 1, 1, 1, 1, 0.99144486, 0.92387953, 0.79335334, 0, 0, 0, 0, 0, 0, 0.13052619, 0.38268343, 0.60876143]
];
var G_WIN = [-1, 26, -31, 208, 218, 401, -519, 2063, 2e3, 4788, -5517, 7134, 5959, 35640, -39336, 74992, -1, 24, -35, 202, 222, 347, -581, 2080, 1952, 4425, -5879, 7640, 5288, 33791, -41176, 74856, -1, 21, -38, 196, 225, 294, -645, 2087, 1893, 4063, -6237, 8092, 4561, 31947, -43006, 74630, -1, 19, -41, 190, 227, 244, -711, 2085, 1822, 3705, -6589, 8492, 3776, 30112, -44821, 74313, -1, 17, -45, 183, 228, 197, -779, 2075, 1739, 3351, -6935, 8840, 2935, 28289, -46617, 73908, -1, 16, -49, 176, 228, 153, -848, 2057, 1644, 3004, -7271, 9139, 2037, 26482, -48390, 73415, -2, 14, -53, 169, 227, 111, -919, 2032, 1535, 2663, -7597, 9389, 1082, 24694, -50137, 72835, -2, 13, -58, 161, 224, 72, -991, 2001, 1414, 2330, -7910, 9592, 70, 22929, -51853, 72169, -2, 11, -63, 154, 221, 36, -1064, 1962, 1280, 2006, -8209, 9750, -998, 21189, -53534, 71420, -2, 10, -68, 147, 215, 2, -1137, 1919, 1131, 1692, -8491, 9863, -2122, 19478, -55178, 70590, -3, 9, -73, 139, 208, -29, -1210, 1870, 970, 1388, -8755, 9935, -3300, 17799, -56778, 69679, -3, 8, -79, 132, 200, -57, -1283, 1817, 794, 1095, -8998, 9966, -4533, 16155, -58333, 68692, -4, 7, -85, 125, 189, -83, -1356, 1759, 605, 814, -9219, 9959, -5818, 14548, -59838, 67629, -4, 7, -91, 117, 177, -106, -1428, 1698, 402, 545, -9416, 9916, -7154, 12980, -61289, 66494, -5, 6, -97, 111, 163, -127, -1498, 1634, 185, 288, -9585, 9838, -8540, 11455, -62684, 65290];
var G_SEC = [10.19000816, 0.50060302, 0.50241929, 3.40760851, 0.50547093, 0.52249861, 2.05778098, 0.51544732, 0.56694406, 1.4841646, 0.53104258, 0.6468218, 1.16943991, 0.55310392, 0.7881546, 0.97256821, 0.58293498, 1.06067765, 0.83934963, 0.62250412, 1.72244716, 0.74453628, 0.67480832, 5.10114861];
var G_TWID9 = [0.73727734, 0.79335334, 0.84339145, 0.88701083, 0.92387953, 0.95371695, 0.97629601, 0.99144486, 0.99904822, 0.67559021, 0.60876143, 0.53729961, 0.46174861, 0.38268343, 0.3007058, 0.21643961, 0.13052619, 0.04361938];
var G_TWID3 = [0.79335334, 0.92387953, 0.99144486, 0.60876143, 0.38268343, 0.13052619];
var G_PAN = [0, 1, 0.21132487, 0.78867513, 0.3660254, 0.6339746, 0.5, 0.5, 0.6339746, 0.3660254, 0.78867513, 0.21132487, 1, 0];
var G_EXPFRAC = [931322575e-18, 783145814e-18, 658544508e-18, 553767716e-18];

// ../../packages/fmt-mo3/src/minimp3.ts
var MAX_FREE_FORMAT_FRAME_SIZE = 2304;
var MAX_FRAME_SYNC_MATCHES = 10;
var MAX_L3_FRAME_PAYLOAD_BYTES = MAX_FREE_FORMAT_FRAME_SIZE;
var MAX_BITRESERVOIR_BYTES = 511;
var SHORT_BLOCK_TYPE = 2;
var STOP_BLOCK_TYPE = 3;
var HDR_SIZE = 4;
var BITS_DEQUANTIZER_OUT = -1;
var MAX_SCF = 255 + BITS_DEQUANTIZER_OUT * 4 - 210;
var MAX_SCFI = MAX_SCF + 3 & ~3;
var MINIMP3_MIN = (a, b) => a > b ? b : a;
var MINIMP3_MAX = (a, b) => a < b ? b : a;
function hdrIsValid(h) {
  return h[0] === 255 && ((h[1] & 240) === 240 || (h[1] & 254) === 226) && hdrGetLayer(h) !== 0 && hdrGetBitrate(h) !== 15 && hdrGetSampleRate(h) !== 3;
}
function hdrIsMono(h) {
  return (h[3] & 192) === 192;
}
function hdrIsMsStereo(h) {
  return (h[3] & 224) === 96;
}
function hdrIsFreeFormat(h) {
  return (h[2] & 240) === 0;
}
function hdrIsCrc(h) {
  return (h[1] & 1) === 0;
}
function hdrTestPadding(h) {
  return (h[2] & 2) !== 0;
}
function hdrTestMpeg1(h) {
  return (h[1] & 8) !== 0;
}
function hdrTestNotMpeg25(h) {
  return (h[1] & 16) !== 0;
}
function hdrTestIStereo(h) {
  return (h[3] & 16) !== 0;
}
function hdrTestMsStereo(h) {
  return (h[3] & 32) !== 0;
}
function hdrGetLayer(h) {
  return h[1] >> 1 & 3;
}
function hdrGetBitrate(h) {
  return h[2] >> 4;
}
function hdrGetSampleRate(h) {
  return h[2] >> 2 & 3;
}
function hdrGetMySampleRate(h) {
  return hdrGetSampleRate(h) + ((h[1] >> 3 & 1) + (h[1] >> 4 & 1)) * 3;
}
function hdrIsFrame576(h) {
  return (h[1] & 14) === 2;
}
function hdrIsLayer1(h) {
  return (h[1] & 6) === 6;
}
function hdrSampleRateHz(h) {
  const gHz = [44100, 48e3, 32e3];
  let hz = gHz[hdrGetSampleRate(h)];
  if (!hdrTestMpeg1(h)) hz = hz >> 1;
  if (!hdrTestNotMpeg25(h)) hz = hz >> 1;
  return hz;
}
function hdrFrameSamples(h) {
  return hdrIsLayer1(h) ? 384 : 1152 >> (hdrIsFrame576(h) ? 1 : 0);
}
function hdrBitrateKbps(h) {
  const halfrate = [
    [
      [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80],
      [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80],
      [0, 16, 24, 28, 32, 40, 48, 56, 64, 72, 80, 88, 96, 112, 128]
    ],
    [
      [0, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160],
      [0, 16, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192],
      [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224]
    ]
  ];
  return 2 * halfrate[hdrTestMpeg1(h) ? 1 : 0][hdrGetLayer(h) - 1][hdrGetBitrate(h)];
}
function hdrFrameBytes(h, freeFormatSize) {
  let frameBytes = Math.trunc(hdrFrameSamples(h) * hdrBitrateKbps(h) * 125 / hdrSampleRateHz(h));
  if (hdrIsLayer1(h)) frameBytes &= ~3;
  return frameBytes !== 0 ? frameBytes : freeFormatSize;
}
function hdrPadding(h) {
  return hdrTestPadding(h) ? hdrIsLayer1(h) ? 4 : 1 : 0;
}
function bsInit(bs, data, bytes) {
  bs.buf = data;
  bs.pos = 0;
  bs.limit = bytes * 8;
}
function getBits(bs, n) {
  const s = bs.pos & 7;
  let shl = n + s;
  const p = bs.pos >> 3;
  bs.pos += n;
  if (bs.pos > bs.limit) return 0;
  let next = bs.buf[p] & 255 >> s;
  let cache = 0;
  let idx = p + 1;
  while ((shl -= 8) > 0) {
    cache |= next << shl;
    next = bs.buf[idx++];
  }
  return (cache | next >> -shl) >>> 0;
}
function newGrInfo() {
  return {
    sfbtab: G_SCF_LONG[0],
    part23Length: 0,
    bigValues: 0,
    scalefacCompress: 0,
    globalGain: 0,
    blockType: 0,
    mixedBlockFlag: 0,
    nLongSfb: 22,
    nShortSfb: 0,
    tableSelect: [0, 0, 0],
    regionCount: [0, 0, 0],
    subblockGain: [0, 0, 0],
    preflag: 0,
    scalefacScale: 0,
    count1Table: 0,
    scfsi: 0
  };
}
function mp3decInit(dec) {
  dec.mdctOverlap = [new Float32Array(9 * 32), new Float32Array(9 * 32)];
  dec.qmfState = new Float32Array(15 * 2 * 32);
  dec.reserv = 0;
  dec.freeFormatBytes = 0;
  dec.header = new Uint8Array(4);
  dec.reservBuf = new Uint8Array(511);
}
function l3ReadSideInfo(bs, gr, hdr) {
  const srIdx = hdrGetMySampleRate(hdr) - (hdrGetMySampleRate(hdr) !== 0 ? 1 : 0);
  let grCount = hdrIsMono(hdr) ? 1 : 2;
  let mainDataBegin;
  let scfsi = 0;
  let part23Sum = 0;
  if (hdrTestMpeg1(hdr)) {
    grCount *= 2;
    mainDataBegin = getBits(bs, 9);
    scfsi = getBits(bs, 7 + grCount);
  } else {
    mainDataBegin = getBits(bs, 8 + grCount) >> grCount;
  }
  let g = 0;
  do {
    if (hdrIsMono(hdr)) scfsi = scfsi << 4 >>> 0;
    const gi = gr[g];
    gi.part23Length = getBits(bs, 12);
    part23Sum += gi.part23Length;
    gi.bigValues = getBits(bs, 9);
    if (gi.bigValues > 288) return -1;
    gi.globalGain = getBits(bs, 8);
    gi.scalefacCompress = getBits(bs, hdrTestMpeg1(hdr) ? 4 : 9);
    gi.sfbtab = G_SCF_LONG[srIdx];
    gi.nLongSfb = 22;
    gi.nShortSfb = 0;
    let tables;
    if (getBits(bs, 1) !== 0) {
      gi.blockType = getBits(bs, 2);
      if (gi.blockType === 0) return -1;
      gi.mixedBlockFlag = getBits(bs, 1);
      gi.regionCount[0] = 7;
      gi.regionCount[1] = 255;
      if (gi.blockType === SHORT_BLOCK_TYPE) {
        scfsi &= 3855;
        if (gi.mixedBlockFlag === 0) {
          gi.regionCount[0] = 8;
          gi.sfbtab = G_SCF_SHORT[srIdx];
          gi.nLongSfb = 0;
          gi.nShortSfb = 39;
        } else {
          gi.sfbtab = G_SCF_MIXED[srIdx];
          gi.nLongSfb = hdrTestMpeg1(hdr) ? 8 : 6;
          gi.nShortSfb = 30;
        }
      }
      tables = getBits(bs, 10) << 5;
      gi.subblockGain[0] = getBits(bs, 3);
      gi.subblockGain[1] = getBits(bs, 3);
      gi.subblockGain[2] = getBits(bs, 3);
    } else {
      gi.blockType = 0;
      gi.mixedBlockFlag = 0;
      tables = getBits(bs, 15);
      gi.regionCount[0] = getBits(bs, 4);
      gi.regionCount[1] = getBits(bs, 3);
      gi.regionCount[2] = 255;
    }
    gi.tableSelect[0] = tables >> 10 & 31;
    gi.tableSelect[1] = tables >> 5 & 31;
    gi.tableSelect[2] = tables & 31;
    gi.preflag = hdrTestMpeg1(hdr) ? getBits(bs, 1) : gi.scalefacCompress >= 500 ? 1 : 0;
    gi.scalefacScale = getBits(bs, 1);
    gi.count1Table = getBits(bs, 1);
    gi.scfsi = scfsi >>> 12 & 15;
    scfsi = scfsi << 4 >>> 0;
  } while (++g < grCount);
  if (part23Sum + bs.pos > bs.limit + mainDataBegin * 8) return -1;
  return mainDataBegin;
}
function l3ReadScalefactors(scf, scfOff, istPos, istOff, scfSize, scfCount, bitbuf, scfsi) {
  let sOff = scfOff, iOff = istOff;
  for (let i = 0; i < 4 && scfCount[i] !== 0; i++, scfsi *= 2) {
    const cnt = scfCount[i];
    if ((scfsi & 8) !== 0) {
      for (let k = 0; k < cnt; k++) scf[sOff + k] = istPos[iOff + k];
    } else {
      const bits = scfSize[i];
      if (bits === 0) {
        for (let k = 0; k < cnt; k++) {
          scf[sOff + k] = 0;
          istPos[iOff + k] = 0;
        }
      } else {
        const maxScf = scfsi < 0 ? (1 << bits) - 1 : -1;
        for (let k = 0; k < cnt; k++) {
          const s = getBits(bitbuf, bits);
          istPos[iOff + k] = s === maxScf ? 255 : s;
          scf[sOff + k] = s;
        }
      }
    }
    sOff += cnt;
    iOff += cnt;
  }
  scf[sOff] = 0;
  scf[sOff + 1] = 0;
  scf[sOff + 2] = 0;
}
function l3LdexpQ2(y, expQ2) {
  let e;
  do {
    e = MINIMP3_MIN(30 * 4, expQ2);
    y = Math.fround(y * Math.fround(G_EXPFRAC[e & 3] * (1 << 30 >> (e >> 2))));
  } while ((expQ2 -= e) > 0);
  return y;
}
function l3DecodeScalefactors(hdr, istPos, bs, gr, scf, ch) {
  let scfPartition = G_SCF_PARTITIONS[(gr.nShortSfb !== 0 ? 1 : 0) + (gr.nLongSfb === 0 ? 1 : 0)];
  const scfSize = [0, 0, 0, 0];
  const iscf = new Uint8Array(40);
  const scfShift = gr.scalefacScale + 1;
  let scfsi = gr.scfsi;
  if (hdrTestMpeg1(hdr)) {
    const part = G_SCFC_DECODE[gr.scalefacCompress];
    scfSize[1] = scfSize[0] = part >> 2;
    scfSize[3] = scfSize[2] = part & 3;
  } else {
    const ist = hdrTestIStereo(hdr) && ch !== 0 ? 1 : 0;
    let sfc = gr.scalefacCompress >> ist;
    let k = ist * 3 * 4;
    let modprod = 1;
    while (sfc >= 0) {
      modprod = 1;
      for (let i = 3; i >= 0; i--) {
        scfSize[i] = Math.trunc(sfc / modprod) % G_MOD[k + i];
        modprod *= G_MOD[k + i];
      }
      sfc -= modprod;
      k += 4;
    }
    scfPartition = scfPartition.slice(k);
    scfsi = -16;
  }
  l3ReadScalefactors(iscf, 0, istPos, 0, scfSize, scfPartition, bs, scfsi);
  if (gr.nShortSfb !== 0) {
    const sh = 3 - scfShift;
    for (let i = 0; i < gr.nShortSfb; i += 3) {
      iscf[gr.nLongSfb + i + 0] = (iscf[gr.nLongSfb + i + 0] ?? 0) + ((gr.subblockGain[0] ?? 0) << sh) & 255;
      iscf[gr.nLongSfb + i + 1] = (iscf[gr.nLongSfb + i + 1] ?? 0) + ((gr.subblockGain[1] ?? 0) << sh) & 255;
      iscf[gr.nLongSfb + i + 2] = (iscf[gr.nLongSfb + i + 2] ?? 0) + ((gr.subblockGain[2] ?? 0) << sh) & 255;
    }
  } else if (gr.preflag !== 0) {
    for (let i = 0; i < 10; i++) iscf[11 + i] = (iscf[11 + i] ?? 0) + (G_PREAMP[i] ?? 0) & 255;
  }
  const gainExp = gr.globalGain + BITS_DEQUANTIZER_OUT * 4 - 210 - (hdrIsMsStereo(hdr) ? 2 : 0);
  const gain = l3LdexpQ2(1 << MAX_SCFI / 4, MAX_SCFI - gainExp);
  const n = gr.nLongSfb + gr.nShortSfb;
  for (let i = 0; i < n; i++) {
    scf[i] = l3LdexpQ2(gain, (iscf[i] | 0) << scfShift);
  }
}
function l3Pow43(x) {
  let mult = 256;
  if (x < 129) return G_POW43[16 + x];
  if (x < 1024) {
    mult = 16;
    x <<= 3;
  }
  const sign = 2 * x & 64;
  const frac = ((x & 63) - sign) / ((x & ~63) + sign);
  return G_POW43[16 + (x + sign >> 6)] * (1 + frac * (4 / 3 + frac * (2 / 9))) * mult;
}
function l3Huffman(dst, dstOffIn, bs, gr, scf, layer3grLimit) {
  let one = 0;
  let ireg = 0;
  let bigValCnt = gr.bigValues;
  let sfbIdx = 0;
  const sfb = gr.sfbtab;
  let dstOff = dstOffIn;
  let bsNextPtr = bs.pos >> 3;
  const load4 = () => {
    const b0 = bs.buf[bsNextPtr] ?? 0;
    const b1 = bs.buf[bsNextPtr + 1] ?? 0;
    const b2 = bs.buf[bsNextPtr + 2] ?? 0;
    const b3 = bs.buf[bsNextPtr + 3] ?? 0;
    return ((b0 * 256 + b1) * 256 + b2) * 256 + b3 << (bs.pos & 7) >>> 0;
  };
  let bsCache = load4();
  let bsSh = (bs.pos & 7) - 8;
  bsNextPtr += 4;
  const peekBits = (n) => n === 0 ? 0 : bsCache >>> 32 - n;
  const flushBits = (n) => {
    bsCache = bsCache << n >>> 0;
    bsSh += n;
  };
  const checkBits = () => {
    while (bsSh >= 0) {
      bsCache = (bsCache | (bs.buf[bsNextPtr++] ?? 0) << bsSh) >>> 0;
      bsSh -= 8;
    }
  };
  const bsPos = () => bsNextPtr * 8 - 24 + bsSh;
  while (bigValCnt > 0) {
    const tabNum = gr.tableSelect[ireg];
    let sfbCnt = gr.regionCount[ireg++];
    const codebookBase = TABINDEX[tabNum];
    const linbits = G_LINBITS[tabNum];
    let np2;
    let pairsToDecode;
    if (linbits !== 0) {
      do {
        np2 = sfb[sfbIdx++] / 2;
        pairsToDecode = MINIMP3_MIN(bigValCnt, np2);
        one = scf[0];
        scf = scf.subarray(1);
        do {
          let w = 5;
          let leaf = TABS[codebookBase + peekBits(w)];
          while (leaf < 0) {
            flushBits(w);
            w = leaf & 7;
            leaf = TABS[codebookBase + peekBits(w) - (leaf >> 3)];
          }
          flushBits(leaf >> 8);
          for (let j = 0; j < 2; j++, dstOff++, leaf >>= 4) {
            let lsb = leaf & 15;
            if (lsb === 15) {
              lsb += peekBits(linbits);
              flushBits(linbits);
              checkBits();
              dst[dstOff] = Math.fround(Math.fround(one * l3Pow43(lsb)) * (bsCache >= 2147483648 ? -1 : 1));
            } else {
              dst[dstOff] = Math.fround(G_POW43[16 + lsb - 16 * (bsCache >>> 31)] * one);
            }
            flushBits(lsb !== 0 ? 1 : 0);
          }
          checkBits();
        } while (--pairsToDecode);
      } while ((bigValCnt -= np2) > 0 && --sfbCnt >= 0);
    } else {
      do {
        np2 = sfb[sfbIdx++] / 2;
        pairsToDecode = MINIMP3_MIN(bigValCnt, np2);
        one = scf[0];
        scf = scf.subarray(1);
        do {
          let w = 5;
          let leaf = TABS[codebookBase + peekBits(w)];
          while (leaf < 0) {
            flushBits(w);
            w = leaf & 7;
            leaf = TABS[codebookBase + peekBits(w) - (leaf >> 3)];
          }
          flushBits(leaf >> 8);
          for (let j = 0; j < 2; j++, dstOff++, leaf >>= 4) {
            const lsb = leaf & 15;
            dst[dstOff] = Math.fround(G_POW43[16 + lsb - 16 * (bsCache >>> 31)] * one);
            flushBits(lsb !== 0 ? 1 : 0);
          }
          checkBits();
        } while (--pairsToDecode);
      } while ((bigValCnt -= np2) > 0 && --sfbCnt >= 0);
    }
  }
  let np = 1 - bigValCnt;
  for (; ; dstOff += 4) {
    const codebookCount1 = gr.count1Table !== 0 ? TAB33 : TAB32;
    let leaf = codebookCount1[peekBits(4)];
    if (!(leaf & 8)) {
      leaf = codebookCount1[(leaf >> 3) + (bsCache << 4 >>> 32 - (leaf & 3))];
    }
    flushBits(leaf & 7);
    if (bsPos() > layer3grLimit) break;
    if (--np === 0) {
      np = sfb[sfbIdx++] / 2;
      if (np === 0) break;
      one = scf[0];
      scf = scf.subarray(1);
    }
    if (leaf & 128) {
      dst[dstOff] = bsCache >= 2147483648 ? -one : one;
      flushBits(1);
    }
    if (leaf & 64) {
      dst[dstOff + 1] = bsCache >= 2147483648 ? -one : one;
      flushBits(1);
    }
    if (--np === 0) {
      np = sfb[sfbIdx++] / 2;
      if (np === 0) break;
      one = scf[0];
      scf = scf.subarray(1);
    }
    if (leaf & 32) {
      dst[dstOff + 2] = bsCache >= 2147483648 ? -one : one;
      flushBits(1);
    }
    if (leaf & 16) {
      dst[dstOff + 3] = bsCache >= 2147483648 ? -one : one;
      flushBits(1);
    }
    checkBits();
  }
  bs.pos = layer3grLimit;
}
function l3MidsideStereo(left, n) {
  const right = left.subarray(576);
  for (let i = 0; i < n; i++) {
    const a = left[i];
    const b = right[i];
    left[i] = Math.fround(a + b);
    right[i] = Math.fround(a - b);
  }
}
function l3IntensityStereoBand(left, leftOff, n, kl, kr) {
  for (let i = 0; i < n; i++) {
    left[leftOff + 576 + i] = left[leftOff + i] * kr;
    left[leftOff + i] = left[leftOff + i] * kl;
  }
}
function l3StereoTopBand(right, rOff, sfb, nbands, maxBand) {
  maxBand[0] = maxBand[1] = maxBand[2] = -1;
  for (let i = 0; i < nbands; i++) {
    for (let k = 0; k < sfb[i]; k += 2) {
      if (right[rOff + k] !== 0 || right[rOff + k + 1] !== 0) {
        maxBand[i % 3] = i;
        break;
      }
    }
    rOff += sfb[i];
  }
}
function l3StereoProcess(left, leftOff, istPos, sfb, hdr, maxBand, mpeg2Sh) {
  const gPan = G_PAN;
  const mpeg1 = hdrTestMpeg1(hdr);
  const maxPos = mpeg1 ? 7 : 64;
  let i = 0;
  for (; sfb[i] !== 0; i++) {
    const ipos = istPos[i];
    if (i > maxBand[i % 3] && ipos < maxPos) {
      const s = hdrTestMsStereo(hdr) ? 1.41421356 : 1;
      let kl, kr;
      if (mpeg1) {
        kl = gPan[2 * ipos];
        kr = gPan[2 * ipos + 1];
      } else {
        kl = 1;
        kr = l3LdexpQ2(1, ipos + 1 >> 1 << mpeg2Sh);
        if ((ipos & 1) !== 0) {
          kl = kr;
          kr = 1;
        }
      }
      l3IntensityStereoBand(left, leftOff, sfb[i], kl * s, kr * s);
    } else if (hdrTestMsStereo(hdr)) {
      l3MidsideStereo(left.subarray(leftOff), sfb[i]);
    }
    leftOff += sfb[i];
  }
}
function l3IntensityStereo(left, istPos, gr, hdr) {
  const nSfb = gr[0].nLongSfb + gr[0].nShortSfb;
  const maxBlocks = gr[0].nShortSfb !== 0 ? 3 : 1;
  const maxBand = [0, 0, 0];
  l3StereoTopBand(left.subarray(576), 0, gr[0].sfbtab, nSfb, maxBand);
  if (gr[0].nLongSfb !== 0) {
    maxBand[0] = maxBand[1] = maxBand[2] = MINIMP3_MAX(MINIMP3_MAX(maxBand[0], maxBand[1]), maxBand[2]);
  }
  for (let i = 0; i < maxBlocks; i++) {
    const defaultPos = hdrTestMpeg1(hdr) ? 3 : 0;
    const itop = nSfb - maxBlocks + i;
    const prev = itop - maxBlocks;
    istPos[1][itop] = maxBand[i] >= prev ? defaultPos : istPos[1][prev];
  }
  l3StereoProcess(left, 0, istPos[1], gr[0].sfbtab, hdr, maxBand, gr[1].scalefacCompress & 1);
}
function l3Reorder(grbuf, gOff, scratch, sOff, sfb, sfbOff) {
  let src = gOff;
  let dst = sOff;
  let idx = sfbOff;
  let len;
  for (; (len = sfb[idx]) !== 0; idx += 3, src += 2 * len) {
    for (let i = 0; i < len; i++, src++) {
      scratch[dst++] = grbuf[src + 0 * len];
      scratch[dst++] = grbuf[src + 1 * len];
      scratch[dst++] = grbuf[src + 2 * len];
    }
  }
  const count = dst - sOff;
  for (let i = 0; i < count; i++) grbuf[gOff + i] = scratch[sOff + i];
}
function l3Antialias(grbuf, gOff, nbands) {
  for (; nbands > 0; nbands--, gOff += 18) {
    for (let i = 0; i < 8; i++) {
      const u = grbuf[gOff + 18 + i];
      const d = grbuf[gOff + 17 - i];
      const aa0 = G_AA[0], aa1 = G_AA[1];
      const fr = Math.fround;
      grbuf[gOff + 18 + i] = fr(fr(u * aa0[i]) - fr(d * aa1[i]));
      grbuf[gOff + 17 - i] = fr(fr(u * aa1[i]) + fr(d * aa0[i]));
    }
  }
}
function l3Dct3_9(y) {
  const fr = Math.fround;
  let s0 = y[0], s2 = y[2], s4 = y[4], s6 = y[6], s8 = y[8];
  const t0 = fr(s0 + fr(s6 * 0.5));
  s0 = fr(s0 - s6);
  const t4 = fr(fr(s4 + s2) * 0.93969262);
  const t2 = fr(fr(s8 + s2) * 0.76604444);
  s6 = fr(fr(s4 - s8) * 0.17364818);
  s4 = fr(s4 + fr(s8 - s2));
  const s2n = fr(s0 - fr(s4 * 0.5));
  y[4] = fr(s4 + s0);
  const s8n = fr(fr(t0 - t2) + s6);
  const s0n = fr(fr(t0 - t4) + t2);
  const s4n = fr(fr(t0 + t4) - s6);
  let s1 = y[1];
  let s3 = y[3];
  const s5 = y[5];
  const s7 = y[7];
  s3 = fr(s3 * 0.8660254);
  const tt0 = fr(fr(s5 + s1) * 0.98480775);
  const tt4 = fr(fr(s5 - s7) * 0.34202014);
  const tt2 = fr(fr(s1 + s7) * 0.64278761);
  s1 = fr(fr(s1 - s5 - s7) * 0.8660254);
  const s5n = fr(fr(tt0 - s3) - tt2);
  const s7n = fr(fr(tt4 - s3) - tt0);
  const s3n = fr(fr(tt4 + s3) - tt2);
  y[0] = fr(s4n - s7n);
  y[1] = fr(s2n + s1);
  y[2] = fr(s0n - s3n);
  y[3] = fr(s8n + s5n);
  y[5] = fr(s8n - s5n);
  y[6] = fr(s0n + s3n);
  y[7] = fr(s2n - s1);
  y[8] = fr(s4n + s7n);
}
function l3Imdct36(grbuf, gOff, overlap, oOff, window, nbands) {
  for (let j = 0; j < nbands; j++, gOff += 18, oOff += 9) {
    const co = new Array(9);
    const si = new Array(9);
    co[0] = -grbuf[gOff];
    si[0] = grbuf[gOff + 17];
    const fr = Math.fround;
    for (let i = 0; i < 4; i++) {
      si[8 - 2 * i] = fr(grbuf[gOff + 4 * i + 1] - grbuf[gOff + 4 * i + 2]);
      co[1 + 2 * i] = fr(grbuf[gOff + 4 * i + 1] + grbuf[gOff + 4 * i + 2]);
      si[7 - 2 * i] = fr(grbuf[gOff + 4 * i + 4] - grbuf[gOff + 4 * i + 3]);
      co[2 + 2 * i] = fr(-(grbuf[gOff + 4 * i + 3] + grbuf[gOff + 4 * i + 4]));
    }
    l3Dct3_9(co);
    l3Dct3_9(si);
    si[1] = -si[1];
    si[3] = -si[3];
    si[5] = -si[5];
    si[7] = -si[7];
    for (let i = 0; i < 9; i++) {
      const ovl = overlap[oOff + i];
      const sum = fr(fr(co[i] * G_TWID9[9 + i]) + fr(si[i] * G_TWID9[0 + i]));
      overlap[oOff + i] = fr(fr(co[i] * G_TWID9[0 + i]) - fr(si[i] * G_TWID9[9 + i]));
      grbuf[gOff + i] = fr(fr(ovl * window[0 + i]) - fr(sum * window[9 + i]));
      grbuf[gOff + 17 - i] = fr(fr(ovl * window[9 + i]) + fr(sum * window[0 + i]));
    }
  }
}
function l3Idct3(x0, x1, x2, dst) {
  const m1 = x1 * 0.8660254;
  const a1 = x0 - x2 * 0.5;
  dst[1] = x0 + x2;
  dst[0] = a1 + m1;
  dst[2] = a1 - m1;
}
function l3Imdct12(x, xOff, dst, dOff, overlap, oOff) {
  const co = [0, 0, 0];
  const si = [0, 0, 0];
  l3Idct3(-x[xOff], x[xOff + 6] + x[xOff + 3], x[xOff + 12] + x[xOff + 9], co);
  l3Idct3(x[xOff + 15], x[xOff + 12] - x[xOff + 9], x[xOff + 6] - x[xOff + 3], si);
  si[1] = -si[1];
  const fr = Math.fround;
  for (let i = 0; i < 3; i++) {
    const ovl = overlap[oOff + i];
    const sum = fr(fr(co[i] * G_TWID3[3 + i]) + fr(si[i] * G_TWID3[0 + i]));
    overlap[oOff + i] = fr(fr(co[i] * G_TWID3[0 + i]) - fr(si[i] * G_TWID3[3 + i]));
    dst[dOff + i] = fr(fr(ovl * G_TWID3[2 - i]) - fr(sum * G_TWID3[5 - i]));
    dst[dOff + 5 - i] = fr(fr(ovl * G_TWID3[5 - i]) + fr(sum * G_TWID3[2 - i]));
  }
}
function l3ImdctShort(grbuf, gOff, overlap, oOff, nbands) {
  for (; nbands > 0; nbands--, oOff += 9, gOff += 18) {
    const tmp = new Float32Array(18);
    for (let i = 0; i < 18; i++) tmp[i] = grbuf[gOff + i];
    for (let i = 0; i < 6; i++) grbuf[gOff + i] = overlap[oOff + i];
    l3Imdct12(tmp, 0, grbuf, gOff + 6, overlap, oOff + 6);
    l3Imdct12(tmp, 1, grbuf, gOff + 12, overlap, oOff + 6);
    l3Imdct12(tmp, 2, overlap, oOff, overlap, oOff + 6);
  }
}
function l3ChangeSign(grbuf, gOff) {
  for (let b = 0, bOff = gOff + 18; b < 32; b += 2, bOff += 36) {
    for (let i = 1; i < 18; i += 2) grbuf[bOff + i] = -grbuf[bOff + i];
  }
}
function l3ImdctGr(grbuf, gOff, overlap, oOff, blockType, nLongBands) {
  if (nLongBands !== 0) {
    l3Imdct36(grbuf, gOff, overlap, oOff, G_MDCT_WINDOW[0], nLongBands);
    gOff += 18 * nLongBands;
    oOff += 9 * nLongBands;
  }
  if (blockType === SHORT_BLOCK_TYPE) {
    l3ImdctShort(grbuf, gOff, overlap, oOff, 32 - nLongBands);
  } else {
    l3Imdct36(grbuf, gOff, overlap, oOff, G_MDCT_WINDOW[blockType === STOP_BLOCK_TYPE ? 1 : 0], 32 - nLongBands);
  }
}
function l3SaveReservoir(dec, maindata, bs) {
  let pos = Math.trunc((bs.pos + 7) / 8);
  let remains = Math.trunc(bs.limit / 8) - pos;
  if (remains > MAX_BITRESERVOIR_BYTES) {
    pos += remains - MAX_BITRESERVOIR_BYTES;
    remains = MAX_BITRESERVOIR_BYTES;
  }
  if (remains > 0) {
    for (let i = 0; i < remains; i++) dec.reservBuf[i] = maindata[pos + i];
  }
  dec.reserv = remains;
}
function l3RestoreReservoir(dec, bs, maindata, mainDataBegin) {
  const frameBytes = Math.trunc((bs.limit - bs.pos) / 8);
  const bytesHave = MINIMP3_MIN(dec.reserv, mainDataBegin);
  const src = Math.max(0, dec.reserv - mainDataBegin);
  const count = MINIMP3_MIN(dec.reserv, mainDataBegin);
  for (let i = 0; i < count; i++) maindata[i] = dec.reservBuf[src + i];
  for (let i = 0; i < frameBytes; i++) maindata[bytesHave + i] = bs.buf[(bs.pos >> 3) + i];
  bsInit(bs, maindata, bytesHave + frameBytes);
  return dec.reserv >= mainDataBegin;
}
function l3Decode(dec, bs, grInfo, nch, grbuf, scratch, reorderScratch, istPos) {
  for (let ch = 0; ch < nch; ch++) {
    const layer3grLimit = bs.pos + grInfo[ch].part23Length;
    l3DecodeScalefactors(dec.header, istPos[ch], bs, grInfo[ch], scratch, ch);
    l3Huffman(grbuf[ch], 0, bs, grInfo[ch], scratch, layer3grLimit);
  }
  if (hdrTestIStereo(dec.header)) {
    l3IntensityStereo(grbuf[0], istPos, grInfo, dec.header);
  } else if (hdrIsMsStereo(dec.header)) {
    l3MidsideStereo(grbuf[0], 576);
  }
  for (let ch = 0; ch < nch; ch++) {
    const gi = grInfo[ch];
    let aaBands = 31;
    const nLongBands = (gi.mixedBlockFlag !== 0 ? 2 : 0) << (hdrGetMySampleRate(dec.header) === 2 ? 1 : 0);
    if (gi.nShortSfb !== 0) {
      aaBands = nLongBands - 1;
      l3Reorder(grbuf[ch], nLongBands * 18, reorderScratch, 0, gi.sfbtab, gi.nLongSfb);
    }
    l3Antialias(grbuf[ch], 0, aaBands);
    l3ImdctGr(grbuf[ch], 0, dec.mdctOverlap[ch], 0, gi.blockType, nLongBands);
    l3ChangeSign(grbuf[ch], 0);
  }
}
function mp3dDctII(grbuf, gOff, n) {
  for (let k = 0; k < n; k++) {
    const t = [[], [], [], []].map(() => new Array(8).fill(0));
    let y = gOff + k;
    const fr = Math.fround;
    for (let i = 0; i < 8; i++) {
      const x0 = grbuf[y + i * 18];
      const x1 = grbuf[y + (15 - i) * 18];
      const x2 = grbuf[y + (16 + i) * 18];
      const x3 = grbuf[y + (31 - i) * 18];
      const t0 = fr(x0 + x3);
      const t1 = fr(x1 + x2);
      const t2 = fr((x1 - x2) * G_SEC[3 * i + 0]);
      const t3 = fr((x0 - x3) * G_SEC[3 * i + 1]);
      t[0][i] = fr(t0 + t1);
      t[1][i] = fr((t0 - t1) * G_SEC[3 * i + 2]);
      t[2][i] = fr(t3 + t2);
      t[3][i] = fr((t3 - t2) * G_SEC[3 * i + 2]);
    }
    for (let i = 0; i < 4; i++) {
      const x = t[i];
      let x0 = x[0], x1 = x[1], x2 = x[2], x3 = x[3], x4 = x[4], x5 = x[5], x6 = x[6], x7 = x[7];
      let xt = fr(x0 - x7);
      x0 = fr(x0 + x7);
      x7 = fr(x1 - x6);
      x1 = fr(x1 + x6);
      x6 = fr(x2 - x5);
      x2 = fr(x2 + x5);
      x5 = fr(x3 - x4);
      x3 = fr(x3 + x4);
      x4 = fr(x0 - x3);
      x0 = fr(x0 + x3);
      x3 = fr(x1 - x2);
      x1 = fr(x1 + x2);
      x[0] = fr(x0 + x1);
      x[4] = fr((x0 - x1) * 0.70710677);
      x5 = fr(x5 + x6);
      x6 = fr((x6 + x7) * 0.70710677);
      x7 = fr(x7 + xt);
      x3 = fr((x3 + x4) * 0.70710677);
      x5 = fr(x5 - x7 * 0.198912367);
      x7 = fr(x7 + x5 * 0.382683432);
      x5 = fr(x5 - x7 * 0.198912367);
      x0 = fr(xt - x6);
      xt = fr(xt + x6);
      x[1] = fr((xt + x7) * 0.50979561);
      x[2] = fr((x4 + x3) * 0.54119611);
      x[3] = fr((x0 - x5) * 0.60134488);
      x[5] = fr((x0 + x5) * 0.89997619);
      x[6] = fr((x4 - x3) * 1.30656302);
      x[7] = fr((xt - x7) * 2.56291556);
    }
    for (let i = 0; i < 7; i++, y += 4 * 18) {
      grbuf[y + 0 * 18] = t[0][i];
      grbuf[y + 1 * 18] = fr(t[2][i] + t[3][i] + t[3][i + 1]);
      grbuf[y + 2 * 18] = fr(t[1][i] + t[1][i + 1]);
      grbuf[y + 3 * 18] = fr(t[2][i + 1] + t[3][i] + t[3][i + 1]);
    }
    grbuf[y + 0 * 18] = t[0][7];
    grbuf[y + 1 * 18] = fr(t[2][7] + t[3][7]);
    grbuf[y + 2 * 18] = t[1][7];
    grbuf[y + 3 * 18] = t[3][7];
  }
}
function mp3dScalePcm(sample) {
  const f = Math.fround(sample);
  if (f >= 32766.5) return 32767;
  if (f <= -32767.5) return -32768;
  let s = Math.trunc(Math.fround(f + 0.5));
  s -= s < 0 ? 1 : 0;
  return s;
}
function mp3dSynthPair(pcm, pOff, z, zOff) {
  const fr = Math.fround;
  let a = 0;
  a = fr(fr(z[zOff + 14 * 64] - z[zOff + 0]) * 29);
  a = fr(a + fr(fr(z[zOff + 1 * 64] + z[zOff + 13 * 64]) * 213));
  a = fr(a + fr(fr(z[zOff + 12 * 64] - z[zOff + 2 * 64]) * 459));
  a = fr(a + fr(fr(z[zOff + 3 * 64] + z[zOff + 11 * 64]) * 2037));
  a = fr(a + fr(fr(z[zOff + 10 * 64] - z[zOff + 4 * 64]) * 5153));
  a = fr(a + fr(fr(z[zOff + 5 * 64] + z[zOff + 9 * 64]) * 6574));
  a = fr(a + fr(fr(z[zOff + 8 * 64] - z[zOff + 6 * 64]) * 37489));
  a = fr(a + fr(z[zOff + 7 * 64] * 75038));
  pcm[pOff] = mp3dScalePcm(a);
  const z2 = zOff + 2;
  a = fr(z[z2 + 14 * 64] * 104);
  a = fr(a + fr(z[z2 + 12 * 64] * 1567));
  a = fr(a + fr(z[z2 + 10 * 64] * 9727));
  a = fr(a + fr(z[z2 + 8 * 64] * 64019));
  a = fr(a + fr(z[z2 + 6 * 64] * -9975));
  a = fr(a + fr(z[z2 + 4 * 64] * -45));
  a = fr(a + fr(z[z2 + 2 * 64] * 146));
  a = fr(a + fr(z[z2 + 0 * 64] * -5));
  pcm[pOff + 16] = mp3dScalePcm(a);
}
function mp3dSynth(xl, xOff, pcm, dstlOff, nch, lins, lOff) {
  const Z = (idx) => lins[15 * 64 + lOff + idx];
  const ZW = (idx, v) => {
    lins[15 * 64 + lOff + idx] = v;
  };
  const xr = xOff + 576 * (nch - 1);
  const dstr = dstlOff + (nch - 1);
  let wi = 0;
  const a = [0, 0, 0, 0];
  const b = [0, 0, 0, 0];
  ZW(4 * 15, xl[xOff + 18 * 16]);
  ZW(4 * 15 + 1, xl[xr + 18 * 16]);
  ZW(4 * 15 + 2, xl[xOff + 0]);
  ZW(4 * 15 + 3, xl[xr + 0]);
  ZW(4 * 31, xl[xOff + 1 + 18 * 16]);
  ZW(4 * 31 + 1, xl[xr + 1 + 18 * 16]);
  ZW(4 * 31 + 2, xl[xOff + 1]);
  ZW(4 * 31 + 3, xl[xr + 1]);
  mp3dSynthPair(pcm, dstr, lins, lOff + 4 * 15 + 1);
  mp3dSynthPair(pcm, dstr + 32 * nch, lins, lOff + 4 * 15 + 64 + 1);
  mp3dSynthPair(pcm, dstlOff, lins, lOff + 4 * 15);
  mp3dSynthPair(pcm, dstlOff + 32 * nch, lins, lOff + 4 * 15 + 64);
  for (let i = 14; i >= 0; i--) {
    ZW(4 * i, xl[xOff + 18 * (31 - i)]);
    ZW(4 * i + 1, xl[xr + 18 * (31 - i)]);
    ZW(4 * i + 2, xl[xOff + 1 + 18 * (31 - i)]);
    ZW(4 * i + 3, xl[xr + 1 + 18 * (31 - i)]);
    ZW(4 * (i + 16), xl[xOff + 1 + 18 * (1 + i)]);
    ZW(4 * (i + 16) + 1, xl[xr + 1 + 18 * (1 + i)]);
    ZW(4 * (i - 16) + 2, xl[xOff + 18 * (1 + i)]);
    ZW(4 * (i - 16) + 3, xl[xr + 18 * (1 + i)]);
    for (let k = 0; k < 8; k++) {
      const w0 = G_WIN[wi++], w1 = G_WIN[wi++];
      const vz = 4 * i - k * 64;
      const vy = 4 * i - (15 - k) * 64;
      const fr = Math.fround;
      for (let j = 0; j < 4; j++) {
        if (k === 0) {
          b[j] = fr(fr(Z(vz + j) * w1) + fr(Z(vy + j) * w0));
          a[j] = fr(fr(Z(vz + j) * w0) - fr(Z(vy + j) * w1));
        } else if (k % 2 === 1) {
          b[j] = fr(b[j] + fr(fr(Z(vz + j) * w1) + fr(Z(vy + j) * w0)));
          a[j] = fr(a[j] + fr(fr(Z(vy + j) * w1) - fr(Z(vz + j) * w0)));
        } else {
          b[j] = fr(b[j] + fr(fr(Z(vz + j) * w1) + fr(Z(vy + j) * w0)));
          a[j] = fr(a[j] + fr(fr(Z(vz + j) * w0) - fr(Z(vy + j) * w1)));
        }
      }
    }
    pcm[dstr + (15 - i) * nch] = mp3dScalePcm(a[1]);
    pcm[dstr + (17 + i) * nch] = mp3dScalePcm(b[1]);
    pcm[dstlOff + (15 - i) * nch] = mp3dScalePcm(a[0]);
    pcm[dstlOff + (17 + i) * nch] = mp3dScalePcm(b[0]);
    pcm[dstr + (47 - i) * nch] = mp3dScalePcm(a[3]);
    pcm[dstr + (49 + i) * nch] = mp3dScalePcm(b[3]);
    pcm[dstlOff + (47 - i) * nch] = mp3dScalePcm(a[2]);
    pcm[dstlOff + (49 + i) * nch] = mp3dScalePcm(b[2]);
  }
}
function mp3dSynthGranule(dec, grbuf, nbands, nch, pcm, pOff, lins) {
  for (let i = 0; i < nch; i++) {
    mp3dDctII(grbuf, 576 * i, nbands);
  }
  for (let i = 0; i < 15 * 64; i++) lins[i] = dec.qmfState[i];
  for (let i = 0; i < nbands; i += 2) {
    mp3dSynth(grbuf, i, pcm, pOff + 32 * nch * i, nch, lins, i * 64);
  }
  if (nch === 1) {
    for (let i = 0; i < 15 * 64; i += 2) {
      dec.qmfState[i] = lins[nbands * 64 + i];
    }
  } else {
    for (let i = 0; i < 15 * 64; i++) {
      dec.qmfState[i] = lins[nbands * 64 + i];
    }
  }
}
function hdrIsTag(h) {
  return h[0] === 84 && h[1] === 65 && h[2] === 71 && h[3] === 0;
}
function hdrIsNull(h) {
  return h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0;
}
function hdrIsNullOrTag(h) {
  return hdrIsTag(h) || hdrIsNull(h);
}
function hdrCompare(h1, h2) {
  return hdrIsValid(h2) && ((h1[1] ^ h2[1]) & 254) === 0 && ((h1[2] ^ h2[2]) & 12) === 0 && hdrIsFreeFormat(h1) === hdrIsFreeFormat(h2);
}
function mp3dMatchFrame(hdr, mp3Bytes, frameBytes) {
  let i = 0;
  for (let nmatch = 0; nmatch < MAX_FRAME_SYNC_MATCHES; nmatch++) {
    i += hdrFrameBytes(hdr.subarray(i), frameBytes) + hdrPadding(hdr.subarray(i));
    if (i + HDR_SIZE > mp3Bytes) return nmatch > 0;
    if (hdrIsNullOrTag(hdr.subarray(i))) return nmatch > 0;
    if (!hdrCompare(hdr, hdr.subarray(i))) return false;
  }
  return true;
}
function mp3dFindFrame(mp3, mp3Bytes, freeFormatBytes, ptrFrameBytes) {
  let i = 0;
  for (; i < mp3Bytes - HDR_SIZE; i++) {
    const h = mp3.subarray(i);
    if (hdrIsValid(h)) {
      let frameBytes = hdrFrameBytes(h, freeFormatBytes.v);
      let frameAndPadding = frameBytes + hdrPadding(h);
      for (let k = HDR_SIZE; !frameBytes && k < MAX_FREE_FORMAT_FRAME_SIZE && i + 2 * k < mp3Bytes - HDR_SIZE; k++) {
        if (hdrCompare(h, mp3.subarray(i + k))) {
          const fb = k - hdrPadding(h);
          const nextfb = fb + hdrPadding(mp3.subarray(i + k));
          if (i + k + nextfb + HDR_SIZE > mp3Bytes || !hdrCompare(h, mp3.subarray(i + k + nextfb))) continue;
          frameAndPadding = k;
          frameBytes = fb;
          freeFormatBytes.v = fb;
        }
      }
      if (frameBytes !== 0 && i + frameAndPadding <= mp3Bytes && mp3dMatchFrame(h, mp3Bytes - i, frameBytes) || i === 0 && frameAndPadding === mp3Bytes) {
        ptrFrameBytes.v = frameAndPadding;
        return i;
      }
      freeFormatBytes.v = 0;
    }
  }
  ptrFrameBytes.v = 0;
  return mp3Bytes;
}
function mp3decDecodeFrame(dec, mp3, mp3Bytes, pcm, info) {
  let i = 0;
  let frameSize = 0;
  let success = true;
  const bsFrame = { buf: mp3, pos: 0, limit: 0 };
  const maindata = new Uint8Array(MAX_BITRESERVOIR_BYTES + MAX_L3_FRAME_PAYLOAD_BYTES + 16);
  const grbuf = [new Float32Array(576), new Float32Array(576)];
  const scf = new Float32Array(40);
  const syn = new Float32Array((18 + 15) * 2 * 32);
  const istPos = [new Uint8Array(39), new Uint8Array(39)];
  const grInfo = [newGrInfo(), newGrInfo(), newGrInfo(), newGrInfo()];
  if (mp3Bytes > 4 && dec.header[0] === 255 && hdrCompare(dec.header, mp3)) {
    frameSize = hdrFrameBytes(mp3, dec.freeFormatBytes) + hdrPadding(mp3);
    if (frameSize !== mp3Bytes && (frameSize + HDR_SIZE > mp3Bytes || !hdrCompare(mp3, mp3.subarray(frameSize)))) {
      frameSize = 0;
    }
  }
  if (frameSize === 0) {
    mp3decInit(dec);
    const ffRef = { v: dec.freeFormatBytes };
    const fbRef = { v: 0 };
    i = mp3dFindFrame(mp3, mp3Bytes, ffRef, fbRef);
    dec.freeFormatBytes = ffRef.v;
    if (fbRef.v === 0 || i + fbRef.v > mp3Bytes) {
      info.frameBytes = i;
      return 0;
    }
    frameSize = fbRef.v;
  }
  const hdr = mp3.subarray(i);
  dec.header.set(hdr.subarray(0, HDR_SIZE));
  info.frameBytes = i + frameSize;
  info.channels = hdrIsMono(hdr) ? 1 : 2;
  info.hz = hdrSampleRateHz(hdr);
  info.layer = 4 - hdrGetLayer(hdr);
  info.bitrateKbps = hdrBitrateKbps(hdr);
  bsInit(bsFrame, hdr.subarray(HDR_SIZE), frameSize - HDR_SIZE);
  if (hdrIsCrc(hdr)) getBits(bsFrame, 16);
  if (info.layer === 3) {
    const mainDataBegin = l3ReadSideInfo(bsFrame, grInfo, hdr);
    if (mainDataBegin < 0 || bsFrame.pos > bsFrame.limit) {
      mp3decInit(dec);
      return 0;
    }
    success = l3RestoreReservoir(dec, bsFrame, maindata, mainDataBegin);
    if (success) {
      const granules = hdrTestMpeg1(hdr) ? 2 : 1;
      for (let igr = 0, pcmOff = 0; igr < granules; igr++, pcmOff += 576 * info.channels) {
        grbuf[0].fill(0);
        grbuf[1].fill(0);
        l3Decode(dec, bsFrame, grInfo.slice(igr * info.channels), info.channels, grbuf, scf, syn, istPos);
        mp3dSynthGranule(dec, grbuf[0], 18, info.channels, pcm, pcmOff, syn);
      }
    }
    l3SaveReservoir(dec, maindata, bsFrame);
  } else {
    return 0;
  }
  return success ? hdrFrameSamples(dec.header) : 0;
}

// ../../packages/fmt-mo3/src/ogg.ts
import { stbVorbisOpenMemory, stbVorbisGetFrameFloat } from "@modplayjs/stb-vorbis";
var CRC_TABLE = (
  /* computed lazily */
  buildCrcTable()
);
function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i << 24 >>> 0;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 2147483648 ? value << 1 >>> 0 ^ 79764919 : value << 1 >>> 0;
    }
    table[i] = value >>> 0;
  }
  return table;
}
function crcOgg(data, from = 0, to = data.length) {
  let value = 0;
  for (let i = from; i < to; i++) {
    value = (value << 8 >>> 0 ^ (CRC_TABLE[value >>> 24 & 255 ^ data[i]] ?? 0)) >>> 0;
  }
  return value >>> 0;
}
function u32le(b, off) {
  return (b[off] | b[off + 1] << 8 | b[off + 2] << 16 | b[off + 3] << 24) >>> 0;
}
function readPage(b, pos) {
  if (pos + 27 > b.length) return null;
  const flag = b[pos + 5];
  const granule0 = u32le(b, pos + 6);
  const granule1 = u32le(b, pos + 10);
  const serial = u32le(b, pos + 14);
  const sequence = u32le(b, pos + 18);
  const storedCrc = u32le(b, pos + 22);
  const segmentCount = b[pos + 26];
  if (pos + 27 + segmentCount > b.length) return null;
  const segmentTable = b.subarray(pos + 27, pos + 27 + segmentCount);
  let dataSize = 0;
  for (let i = 0; i < segmentCount; i++) dataSize += segmentTable[i];
  const end = pos + 27 + segmentCount + dataSize;
  if (end > b.length) return null;
  const raw = b.subarray(pos, end);
  const scratch = new Uint8Array(raw.length);
  scratch.set(raw);
  scratch[22] = 0;
  scratch[23] = 0;
  scratch[24] = 0;
  scratch[25] = 0;
  if (storedCrc !== crcOgg(scratch)) return null;
  return {
    page: {
      serial,
      sequence,
      flag,
      granule0,
      granule1,
      segmentTable,
      data: b.subarray(pos + 27 + segmentCount, end)
    },
    end
  };
}
function readPageAndSkipJunk(b, pos) {
  let p = pos;
  while (p + 4 <= b.length) {
    if (b[p] === 79 && b[p + 1] === 103 && b[p + 2] === 103 && b[p + 3] === 83) {
      const r = readPage(b, p);
      if (r) return r;
      p += 4;
    } else {
      p++;
    }
  }
  return null;
}
function serializePage(page, newSerial) {
  const headerSize = 27 + page.segmentTable.length;
  const total = headerSize + page.data.length;
  const raw = new Uint8Array(total);
  raw[0] = 79;
  raw[1] = 103;
  raw[2] = 103;
  raw[3] = 83;
  raw[4] = 0;
  raw[5] = page.flag;
  let g0 = page.granule0 >>> 0, g1 = page.granule1 >>> 0;
  for (let i = 0; i < 8; i++) raw[6 + i] = i < 4 ? g0 >>> i * 8 & 255 : g1 >>> (i - 4) * 8 & 255;
  raw.set([newSerial & 255, newSerial >>> 8 & 255, newSerial >>> 16 & 255, newSerial >>> 24 & 255], 14);
  raw.set([page.sequence & 255, page.sequence >>> 8 & 255, page.sequence >>> 16 & 255, page.sequence >>> 24 & 255], 18);
  raw[26] = page.segmentTable.length;
  raw.set(page.segmentTable, 27);
  raw.set(page.data, headerSize);
  raw[22] = raw[23] = raw[24] = raw[25] = 0;
  const c = crcOgg(raw);
  raw.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24 & 255], 22);
  return raw;
}
function mergeSharedOggHeader(headerBytes, headerSize, dataBytes, dataOff, dataSize) {
  const dataSerials = [];
  for (let p = readPageAndSkipJunk(dataBytes, dataOff); p; p = readPageAndSkipJunk(dataBytes, p.end)) {
    if (!dataSerials.includes(p.page.serial)) dataSerials.push(p.page.serial);
  }
  if (dataSerials.length > 1) {
  }
  const view = headerBytes.subarray(0, headerSize);
  const out = [];
  let headIndex = 0;
  for (let p = readPageAndSkipJunk(view, 0); p; p = readPageAndSkipJunk(view, p.end)) {
    const it = headIndex;
    headIndex++;
    const idx = it;
    let newSerial = 0;
    if (idx < dataSerials.length) {
      newSerial = dataSerials[idx];
    } else {
      let extraIndex = idx - dataSerials.length;
      for (newSerial = 1; newSerial < 4294967295; ++newSerial) {
        if (!dataSerials.includes(newSerial)) {
          extraIndex -= 1;
        }
        if (extraIndex === 0) {
          break;
        }
      }
    }
    out.push(...serializePage(p.page, newSerial));
    void it;
  }
  if (out.length === 0) return null;
  const merged = new Uint8Array(out.length + dataSize);
  let o = 0;
  for (const v of out) merged[o++] = v;
  merged.set(dataBytes.subarray(dataOff, dataOff + dataSize), o);
  return merged;
}
function decodeOggStream(merged, wantFrames, channels) {
  const err = { v: 0 };
  const vor = stbVorbisOpenMemory(merged, err);
  if (!vor) return null;
  if (vor.channels !== channels) {
    return null;
  }
  const out = new Float32Array(wantFrames * channels);
  let offset = 0;
  const len = { v: 0 };
  while (offset < wantFrames) {
    const outputs = stbVorbisGetFrameFloat(vor, len);
    if (!outputs || len.v === 0) break;
    const n = Math.min(len.v, wantFrames - offset);
    for (let ch = 0; ch < channels; ch++) {
      const src = outputs[ch];
      for (let j = 0; j < n; j++) out[(offset + j) * channels + ch] = src[j];
    }
    offset += n;
  }
  return offset > 0 ? out.subarray(0, offset * channels) : null;
}

// ../../packages/fmt-mo3/src/mo3.ts
import { readEvent as fmtModReadEvent } from "@modplayjs/fmt-mod";
var FLAG_LINEAR_SLIDES = 1;
var FLAG_IS_S3M = 2;
var FLAG_IS_MTM = 8;
var FLAG_IS_MOD = 128;
var FLAG_IS_IT = 256;
var FLAG_INSTRUMENT_MODE = 512;
var FX_NONE = 0;
var SMP_16BIT = 1;
var SMP_STEREO = 1024;
var SMP_COMPRESSION_MPEG = 4096;
var SMP_COMPRESSION_OGG = 12288;
var SMP_SHARED_OGG = 4096 | 8192 | 16384;
var SMP_DELTA_COMPRESSION = 8192;
var SMP_DELTA_PREDICTION = 16384;
var SMP_COMPRESSION_MASK = 61440;
var EFF_TRANS = [
  FX_NONE,
  FX_NONE,
  FX_NONE,
  FX_ARPEGGIO,
  // 00-03
  FX_PORTA_UP,
  FX_PORTA_DN,
  FX_TONEPORTA,
  FX_VIBRATO,
  // 04-07
  FX_TONE_VSLIDE,
  FX_VIBRA_VSLIDE,
  FX_TREMOLO,
  FX_SETPAN,
  // 08-0b
  FX_OFFSET,
  FX_VOLSLIDE,
  FX_JUMP,
  FX_VOLSET,
  // 0c-0f
  FX_BREAK,
  FX_EXTENDED,
  FX_SPEED,
  FX_TREMOR,
  // 10-13
  FX_NONE,
  FX_NONE,
  FX_GLOBALVOL,
  FX_GVOL_SLIDE,
  // 14-17
  FX_KEYOFF,
  FX_ENVPOS,
  FX_PANSLIDE,
  FX_NONE,
  // 18-1b
  FX_MULTI_RETRIG,
  FX_XF_PORTA,
  FX_XF_PORTA,
  FX_NONE,
  // 1c-1f
  FX_NONE,
  FX_SPEED,
  FX_VOLSLIDE,
  FX_PORTA_DN,
  // 20-23 (IT/S3M)
  FX_PORTA_UP,
  FX_TREMOR,
  FX_MULTI_RETRIG,
  FX_FINE_VIBRATO,
  // 24-27
  FX_TRK_VOL,
  FX_TRK_VSLIDE,
  FX_PANSLIDE,
  FX_EXTENDED,
  // 28-2b (S3MCMDEX → extended)
  FX_IT_BPM,
  FX_GVOL_SLIDE,
  FX_PANBRELLO,
  FX_MACRO,
  // 2c-2f
  FX_NONE,
  FX_NONE,
  FX_NONE,
  FX_NONE,
  // 30-33
  FX_NONE,
  FX_NONE,
  FX_NONE,
  FX_NONE,
  // 34-37
  166,
  190
  // 38-39 (MPTM)
];
var VOLCMD_NONE = 0;
var VOLCMD_VOLUME = 1;
var VOLCMD_PANNING = 2;
var VOLCMD_VOLSLIDEUP = 3;
var VOLCMD_VOLSLIDEDOWN = 4;
var VOLCMD_FINEVOLUP = 5;
var VOLCMD_FINEVOLDOWN = 6;
var VOLCMD_VIBRATOSPEED = 7;
var VOLCMD_VIBRATODEPTH = 8;
var VOLCMD_PANSLIDELEFT = 9;
var VOLCMD_PANSLIDERIGHT = 10;
var VOLCMD_TONEPORTAMENTO = 11;
var VOLCMD_PORTAUP = 12;
var VOLCMD_PORTADOWN = 13;
var VOLCMD_OFFSET = 14;
var ENV_ENABLED = 1;
var ENV_SUSTAIN = 2;
var ENV_LOOP = 4;
var ENV_FILTER = 16;
var ENV_CARRY = 32;
var NOTE_MIN = 13;
var NOTE_KEYOFF = 120;
var NOTE_NOTECUT = 121;
var NOTE_FADE = 122;
function rU8(r) {
  return r.buf[r.pos++] ?? 0;
}
function rU16(r) {
  const v = (r.buf[r.pos] | r.buf[r.pos + 1] << 8) >>> 0;
  r.pos += 2;
  return v;
}
function rI16(r) {
  const v = rU16(r);
  return v >= 32768 ? v - 65536 : v;
}
function rU32(r) {
  const v = (r.buf[r.pos] | r.buf[r.pos + 1] << 8 | r.buf[r.pos + 2] << 16 | r.buf[r.pos + 3] << 24) >>> 0;
  r.pos += 4;
  return v;
}
function rI32(r) {
  const v = rU32(r);
  return v | 0;
}
function rNullString(r) {
  let s = "";
  while (r.pos < r.buf.length) {
    const c = r.buf[r.pos++];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
var AUTO_VIBRATO_IT2XM = [0, 2, 4, 1, 3, 0, 0, 0];
function zeroEnvelope() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function zeroInstrument(name, sub) {
  return {
    name,
    volume: 64,
    nsm: 0,
    rls: 0,
    map: new Array(121).fill(0),
    mapXpo: new Array(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope()
  };
}
function readMo3Envelope(r, envShift, isXm, env) {
  const flags = rU8(r);
  const numNodes = rU8(r);
  const sustainStart = rU8(r);
  const sustainEnd = rU8(r);
  const loopStart = rU8(r);
  const loopEnd = rU8(r);
  const points = [];
  for (let i = 0; i < 25; i++) {
    points.push([rI16(r), rI16(r)]);
  }
  env.flags = ((flags & 1) !== 0 ? ENV_ENABLED : 0) | ((flags & 2) !== 0 ? ENV_SUSTAIN : 0) | ((flags & 4) !== 0 ? ENV_LOOP : 0) | ((flags & 16) !== 0 ? ENV_FILTER : 0) | ((flags & 32) !== 0 ? ENV_CARRY : 0);
  const n = Math.min(numNodes, 25);
  env.npt = n;
  env.sus = sustainStart;
  env.sue = isXm ? sustainStart : sustainEnd;
  env.lps = loopStart;
  env.lpe = loopEnd;
  env.x = [];
  env.y = [];
  for (let i = 0; i < n; i++) {
    let tick = points[i][0];
    if (i > 0 && tick < env.x[i - 1]) tick = env.x[i - 1] + 1;
    env.x.push(tick);
    env.y.push(Math.min(64, Math.max(0, points[i][1] >> envShift)));
  }
}
function mo3Test(bytes) {
  return bytes.length > 8 && bytes[0] === 77 && bytes[1] === 79 && bytes[2] === 51 && bytes[3] <= 5 && (bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24) >>> 0 > 422 && (bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24) >>> 0 < 536870912;
}
function parseMO3(bytes, fail) {
  const version = bytes[3];
  const musicSize = (bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24) >>> 0;
  if (musicSize <= 422 || musicSize >= 536870912) fail("MO3: bad music size");
  if (version > 5) fail("MO3: bad version");
  let compressedSize = 0;
  let inner;
  if (version >= 5) {
    compressedSize = (bytes[8] | bytes[9] << 8 | bytes[10] << 16 | bytes[11] << 24) >>> 0;
    inner = depackMO3Music(bytes.subarray(0, 12 + compressedSize));
  } else {
    inner = depackMO3Music(bytes);
  }
  const r = { buf: inner, pos: 0 };
  const songName = rNullString(r);
  const songMessage = rNullString(r);
  const numChannels = rU8(r);
  const numOrders = rU16(r);
  const restartPos = rU16(r);
  const numPatterns = rU16(r);
  const numTracks = rU16(r);
  const numInstruments = rU16(r);
  const numSamples = rU16(r);
  const defaultSpeed = rU8(r);
  const defaultTempo = rU8(r);
  const flags = rU32(r) >>> 0;
  const globalVol = rU8(r);
  const panSeparation = rU8(r);
  const sampleVolume = rU8(r) << 24 >> 24;
  const chnVolume = [];
  for (let i = 0; i < 64; i++) chnVolume.push(rU8(r));
  const chnPan = [];
  for (let i = 0; i < 64; i++) chnPan.push(rU8(r));
  const sfxMacros = [];
  for (let i = 0; i < 16; i++) sfxMacros.push(rU8(r));
  const fixedMacros = [];
  for (let i = 0; i < 128; i++) fixedMacros.push([rU8(r), rU8(r)]);
  if (numChannels === 0 || numChannels > 64) fail("MO3: bad channel count");
  if (restartPos > numOrders) fail("MO3: bad restart pos");
  if (numInstruments >= 255 || numSamples >= 255) fail("MO3: bad ins/smp count");
  const isIT = (flags & FLAG_IS_IT) !== 0;
  const isS3M = (flags & FLAG_IS_S3M) !== 0;
  const isMOD = (flags & FLAG_IS_MOD) !== 0;
  const isMTM = (flags & FLAG_IS_MTM) !== 0;
  const modType = isIT ? "it" : isS3M ? "s3m" : isMOD ? "mod" : isMTM ? "mtm" : "xm";
  const isXm = modType === "xm";
  const hasOrderSeparators = !(modType === "mod" || isXm);
  const orders = [];
  for (let i = 0; i < numOrders; i++) {
    const b = rU8(r);
    if (hasOrderSeparators && b === 255) break;
    orders.push(hasOrderSeparators && b === 254 ? 254 : b);
  }
  const len = orders.length;
  const trackChunkOff = r.pos;
  r.pos += numPatterns * numChannels * 2;
  const patLengthChunkOff = r.pos;
  r.pos += numPatterns * 2;
  const trackOffsets = [];
  const trackLens = [];
  for (let i = 0; i < numTracks; i++) {
    trackLens.push(rU32(r));
    trackOffsets.push(r.pos);
    r.pos += trackLens[i];
  }
  const patterns = [];
  const noteOffset = modType === "mtm" ? 13 + NOTE_MIN : !isIT ? 12 + NOTE_MIN : NOTE_MIN;
  for (let pat = 0; pat < numPatterns; pat++) {
    const numRows = inner[patLengthChunkOff + pat * 2] | inner[patLengthChunkOff + pat * 2 + 1] << 8;
    const rows = numRows === 0 ? 64 : numRows;
    const tracks = [];
    for (let chn = 0; chn < numChannels; chn++) {
      const ev = [];
      for (let row = 0; row < rows; row++) {
        ev.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      tracks.push({ rows, event: ev });
    }
    patterns.push({ rows, tracks });
  }
  for (let pat = 0; pat < numPatterns; pat++) {
    const numRows = inner[patLengthChunkOff + pat * 2] | inner[patLengthChunkOff + pat * 2 + 1] << 8;
    const rows = numRows === 0 ? 64 : numRows;
    for (let chn = 0; chn < numChannels; chn++) {
      const trackIndex = inner[trackChunkOff + (pat * numChannels + chn) * 2] | inner[trackChunkOff + (pat * numChannels + chn) * 2 + 1] << 8;
      if (trackIndex >= numTracks) continue;
      const tr = { buf: inner, pos: trackOffsets[trackIndex] };
      let row = 0;
      while (row < rows) {
        const b = rU8(tr);
        if (b === 0) break;
        const numCommands = b & 15;
        const rep = b >> 4;
        const m = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
        let volcmd = VOLCMD_NONE;
        let volParam = 0;
        for (let c = 0; c < numCommands; c++) {
          const cmd0 = rU8(tr);
          const cmd1 = rU8(tr);
          switch (cmd0) {
            case 1: {
              let note = cmd1;
              if (note < 120) note += noteOffset;
              else if (note === 255) note = NOTE_KEYOFF;
              else if (note === 254) note = NOTE_NOTECUT;
              else note = NOTE_FADE;
              m.note = note;
              break;
            }
            case 2:
              m.ins = cmd1 + 1;
              break;
            case 6: {
              if (volcmd === VOLCMD_NONE && isXm && !(cmd1 & 15)) {
                volcmd = VOLCMD_TONEPORTAMENTO;
                volParam = cmd1 >> 4;
              } else if (volcmd === VOLCMD_NONE && isIT) {
                const IT_PORTA_VOL = [0, 4, 8, 16, 32, 64, 96, 128, 255];
                let found = false;
                for (let i = 0; i < 9; i++) {
                  if (IT_PORTA_VOL[i] === cmd1) {
                    volcmd = VOLCMD_TONEPORTAMENTO;
                    volParam = i;
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  m.fxt = FX_TONEPORTA;
                  m.fxp = cmd1;
                }
              } else {
                m.fxt = FX_TONEPORTA;
                m.fxp = cmd1;
              }
              break;
            }
            case 7: {
              if (volcmd === VOLCMD_NONE && cmd1 < 10 && isIT) {
                volcmd = VOLCMD_VIBRATODEPTH;
                volParam = cmd1;
              } else {
                m.fxt = FX_VIBRATO;
                m.fxp = cmd1;
              }
              break;
            }
            case 11: {
              if (volcmd === VOLCMD_NONE) {
                if (isIT && cmd1 === 255) {
                  volcmd = VOLCMD_PANNING;
                  volParam = 64;
                  break;
                }
                if (isIT && !(cmd1 & 3) || isXm && !(cmd1 & 15)) {
                  volcmd = VOLCMD_PANNING;
                  volParam = cmd1 / 4;
                  break;
                }
              }
              m.fxt = FX_SETPAN;
              m.fxp = cmd1;
              break;
            }
            case 15: {
              if (modType !== "mod" && volcmd === VOLCMD_NONE && cmd1 <= 64) {
                volcmd = VOLCMD_VOLUME;
                volParam = cmd1;
              } else {
                m.fxt = FX_VOLSET;
                m.fxp = cmd1;
              }
              break;
            }
            case 16: {
              m.fxt = FX_BREAK;
              m.fxp = cmd1;
              if (!isIT) m.fxp = (cmd1 >> 4) * 10 + (cmd1 & 15);
              break;
            }
            case 18: {
              m.fxt = cmd1 < 32 ? FX_SPEED : FX_IT_BPM;
              m.fxp = cmd1;
              break;
            }
            case 20:
            case 21: {
              if ((cmd1 & 240) !== 0) {
                volcmd = cmd0 === 20 ? VOLCMD_VOLSLIDEUP : VOLCMD_FINEVOLUP;
                volParam = cmd1 >> 4;
              } else {
                volcmd = cmd0 === 20 ? VOLCMD_VOLSLIDEDOWN : VOLCMD_FINEVOLDOWN;
                volParam = cmd1 & 15;
              }
              break;
            }
            case 27: {
              if ((cmd1 & 240) !== 0) {
                volcmd = VOLCMD_PANSLIDERIGHT;
                volParam = cmd1 >> 4;
              } else {
                volcmd = VOLCMD_PANSLIDELEFT;
                volParam = cmd1 & 15;
              }
              break;
            }
            case 29:
              m.fxt = FX_XF_PORTA;
              m.fxp = 16 | cmd1;
              break;
            case 30:
              m.fxt = FX_XF_PORTA;
              m.fxp = 32 | cmd1;
              break;
            case 31:
            case 32: {
              volcmd = cmd0 === 31 ? VOLCMD_VIBRATOSPEED : VOLCMD_VIBRATODEPTH;
              volParam = cmd1;
              break;
            }
            case 34: {
              if (m.fxt === FX_TONEPORTA) m.fxt = FX_TONE_VSLIDE;
              else if (m.fxt === FX_VIBRATO) m.fxt = FX_VIBRA_VSLIDE;
              else m.fxt = FX_VOLSLIDE;
              m.fxp = cmd1;
              break;
            }
            case 48: {
              m.vol = cmd1 % 10;
              if (cmd1 < 10) {
                volcmd = VOLCMD_FINEVOLUP;
                m.vol = cmd1 % 10;
              } else if (cmd1 < 20) {
                volcmd = VOLCMD_FINEVOLDOWN;
                m.vol = cmd1 % 10;
              } else if (cmd1 < 30) {
                volcmd = VOLCMD_VOLSLIDEUP;
                m.vol = cmd1 % 10;
              } else if (cmd1 < 40) {
                volcmd = VOLCMD_VOLSLIDEDOWN;
                m.vol = cmd1 % 10;
              }
              break;
            }
            case 49:
            case 50: {
              volcmd = cmd0 === 49 ? VOLCMD_PORTADOWN : VOLCMD_PORTAUP;
              volParam = cmd1;
              break;
            }
            case 52: {
              if (cmd1 >= 223 && cmd1 <= 232) {
                volcmd = VOLCMD_OFFSET;
                volParam = cmd1 - 223;
              }
              break;
            }
            default: {
              if (cmd0 < EFF_TRANS.length) {
                const fx = EFF_TRANS[cmd0];
                if (fx !== FX_NONE || cmd0 === 0) {
                  m.fxt = fx;
                  m.fxp = cmd1;
                }
              }
              break;
            }
          }
        }
        applyVolCmd(m, volcmd, volParam, modType);
        const targetRow = Math.min(row + rep, rows);
        while (row < targetRow) {
          const t = patterns[pat].tracks[chn];
          t.event[row] = { ...m };
          row++;
        }
      }
    }
  }
  const instruments = [];
  const instrVibrato = [];
  const isSampleMode = !isXm && !(flags & FLAG_INSTRUMENT_MODE);
  const insCount = modType === "xm" || !isSampleMode ? numInstruments : numInstruments;
  for (let ins = 0; ins < insCount; ins++) {
    const name = rNullString(r);
    if (version >= 5) rNullString(r);
    const insFlags = rU32(r) >>> 0;
    const sampleMap = [];
    for (let i = 0; i < 120; i++) {
      sampleMap.push([rU16(r), rU16(r)]);
    }
    const aei = zeroEnvelope();
    const pei = zeroEnvelope();
    const fei = zeroEnvelope();
    readMo3Envelope(r, 0, isXm, aei);
    readMo3Envelope(r, 0, isXm, pei);
    readMo3Envelope(r, 5, isXm, fei);
    const vibType = rU8(r);
    const vibSweep = rU8(r);
    const vibDepth = rU8(r);
    const vibRate = rU8(r);
    const fadeOut = rU16(r);
    const midiChannel = rU8(r);
    const midiBank = rU8(r);
    const midiPatch = rU8(r);
    const midiBend = rU8(r);
    const globalVol2 = rU8(r);
    const panning = rU16(r);
    const nna = rU8(r);
    void nna;
    const pps = rU8(r);
    const ppc = rU8(r);
    const dct = rU8(r);
    const dca = rU8(r);
    const volSwing = rU16(r);
    const panSwing = rU16(r);
    const cutoff = rU8(r);
    const resonance = rU8(r);
    void insFlags;
    void midiChannel;
    void midiBank;
    void midiPatch;
    void midiBend;
    void volSwing;
    void panSwing;
    void pps;
    void ppc;
    const xxi = zeroInstrument(name, []);
    if (isXm) {
      for (let i = 0; i < 96; i++) {
        xxi.map[i + 12] = sampleMap[i][1] + 1 === 0 ? 0 : sampleMap[i][1];
        xxi.map[i + 12] = sampleMap[i][1] === 65535 ? 255 : sampleMap[i][1];
      }
    } else {
      for (let i = 0; i < 120; i++) {
        xxi.mapXpo[i] = sampleMap[i][0] - (i - 12);
        xxi.map[i] = sampleMap[i][1] === 65535 ? 255 : sampleMap[i][1] + 1;
      }
    }
    xxi.aei = aei;
    xxi.pei = pei;
    xxi.fei = fei;
    xxi.rls = fadeOut;
    xxi.volume = isIT ? Math.min(globalVol2, 128) / 2 : 64;
    if (panning <= 256) {
    }
    xxi.nsm = 0;
    instruments.push(xxi);
    if (isXm) {
      instrVibrato.push({ type: AUTO_VIBRATO_IT2XM[vibType & 7], sweep: vibSweep, depth: vibDepth, rate: vibRate });
    }
    void dct;
    void dca;
    void cutoff;
    void resonance;
    void panSeparation;
    void sampleVolume;
  }
  if (isSampleMode) {
    instruments.length = 0;
  }
  const frequencyIsHertz = version >= 5 || !(flags & FLAG_LINEAR_SLIDES);
  const sampleHeaders = [];
  const sampleNames = [];
  for (let smp = 0; smp < numSamples; smp++) {
    const name = rNullString(r);
    if (version >= 5) rNullString(r);
    const freqFinetune = rU32(r);
    const transpose = rU8(r) << 24 >> 24;
    const defaultVolume = rU8(r);
    const panning = rU16(r);
    const length = rU32(r);
    const loopStart = rU32(r);
    const loopEnd = rU32(r);
    const sflags = rU16(r) >>> 0;
    const vibType = rU8(r);
    const vibSweep = rU8(r);
    const vibDepth = rU8(r);
    const vibRate = rU8(r);
    const globalVol2 = rU8(r);
    const sustainStart = rU32(r);
    const sustainEnd = rU32(r);
    const compressedSize2 = rI32(r);
    const encoderDelay = rU16(r);
    let sharedOggHeader = 0;
    if (version >= 5 && (sflags & SMP_COMPRESSION_MASK) === SMP_SHARED_OGG) {
      sharedOggHeader = rU16(r) << 16 >> 16;
    }
    sampleNames.push(name);
    sampleHeaders.push({
      flags: sflags,
      length,
      loopStart,
      loopEnd,
      sustainStart,
      sustainEnd,
      compressedSize: compressedSize2,
      encoderDelay,
      vibType,
      vibSweep,
      vibDepth,
      vibRate,
      globalVol: globalVol2,
      finetune: freqFinetune,
      transpose,
      volume: defaultVolume,
      panning,
      sharedOggHeader
    });
    void frequencyIsHertz;
  }
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    let pan = 128;
    let flg = 0;
    if (isIT) {
    }
    if (!isXm) {
      if (chnPan[i] === 127) flg |= 16;
      else if (chnPan[i] === 255) pan = 256;
      else pan = chnPan[i];
    }
    channels.push({ pan: Math.min(255, pan), vol: isIT ? Math.min(chnVolume[i], 64) : 64, flg });
  }
  let c4rate = 8363;
  let periodType = PeriodType.AMIGA;
  let quirks = 0;
  let readEventType = ReadEventType.FT2;
  if (isIT) {
    readEventType = ReadEventType.IT;
    quirks = 66153712;
    periodType = (flags & FLAG_LINEAR_SLIDES) !== 0 ? PeriodType.LINEAR : PeriodType.AMIGA;
  } else if (isS3M) {
    readEventType = ReadEventType.ST3;
    periodType = (flags & FLAG_LINEAR_SLIDES) !== 0 ? PeriodType.LINEAR : PeriodType.AMIGA;
  } else if (isXm) {
    readEventType = ReadEventType.FT2;
    periodType = (flags & FLAG_LINEAR_SLIDES) !== 0 ? PeriodType.LINEAR : PeriodType.AMIGA;
  }
  const mod = {
    title: songName,
    format: "mo3",
    // dispatch key — our plugin name (readEventType carries the semantics)
    comment: songMessage,
    chn: numChannels,
    pat: numPatterns,
    ins: isSampleMode ? 0 : numInstruments,
    len,
    restart: restartPos >= len ? 0 : restartPos,
    xxo: orders,
    channels,
    patterns,
    instruments: isSampleMode ? [] : instruments,
    samples: [],
    num_sequences: 0,
    sequences: [],
    speed: defaultSpeed || 6,
    bpm: defaultTempo || 125,
    volbase: 64,
    gvolbase: isIT ? 128 : isS3M ? 64 : 64,
    gvol: isIT ? Math.min(globalVol, 128) * 2 : isS3M ? Math.min(globalVol, 64) * 4 : 64,
    quirks,
    flowMode: 0,
    readEventType,
    periodType,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate,
    compare_vblank: false,
    tracker: `MO3 v${version}`
  };
  void sampleVolume;
  let filePos = version >= 5 ? 12 + compressedSize : lastConsumed();
  const sampleChunks = [];
  for (let smp = 0; smp < numSamples; smp++) {
    const h = sampleHeaders[smp];
    if (h.compressedSize > 0) {
      sampleChunks.push({ data: bytes, off: filePos, size: h.compressedSize });
      filePos += h.compressedSize;
    } else if (h.compressedSize === 0 && h.length > 0) {
      const frames = h.length * ((h.flags & SMP_16BIT ? 2 : 1) * (h.flags & SMP_STEREO ? 2 : 1));
      sampleChunks.push({ data: bytes, off: filePos, size: frames });
      filePos += frames;
    } else {
      sampleChunks.push({ data: bytes, off: 0, size: 0 });
    }
  }
  return { mod, sampleChunks, sampleHeaders, version };
}
function applyVolCmd(m, volcmd, volParam, modType) {
  const isIT = modType === "it";
  const isXm = modType === "xm";
  const volFx = (code, param) => {
    m.f2t = code;
    m.f2p = param;
  };
  switch (volcmd) {
    case VOLCMD_VOLUME:
      m.vol = volParam + 1;
      break;
    case VOLCMD_PANNING:
      volFx(8, volParam * 4);
      break;
    case VOLCMD_VOLSLIDEUP:
      volFx(isIT ? 164 : 10, isIT ? volParam : volParam << 4);
      break;
    case VOLCMD_VOLSLIDEDOWN:
      volFx(isIT ? 164 : 10, isIT ? volParam : volParam);
      break;
    case VOLCMD_FINEVOLUP:
      if (isXm) volFx(14, 10 << 4 | volParam);
      else if (isIT) volFx(130, volParam);
      else volFx(14, 10 << 4 | volParam);
      break;
    case VOLCMD_FINEVOLDOWN:
      if (isXm) volFx(14, 11 << 4 | volParam);
      else if (isIT) volFx(130, volParam);
      else volFx(14, 11 << 4 | volParam);
      break;
    case VOLCMD_TONEPORTAMENTO:
      volFx(3, isXm ? volParam << 4 : volParam);
      break;
    case VOLCMD_VIBRATODEPTH:
      volFx(isIT ? 172 : 4, volParam);
      break;
    case VOLCMD_VIBRATOSPEED:
      volFx(4, volParam << 4);
      break;
    case VOLCMD_PANSLIDELEFT:
      volFx(181, volParam << 4);
      break;
    case VOLCMD_PANSLIDERIGHT:
      volFx(181, volParam);
      break;
    case VOLCMD_PORTAUP:
      volFx(1, volParam);
      break;
    case VOLCMD_PORTADOWN:
      volFx(2, volParam);
      break;
    case VOLCMD_OFFSET:
      volFx(9, volParam);
      break;
    default:
      break;
  }
}
function unpackMo3DeltaSample(data, off, dst, length, numChannels, is16) {
  let dh = is16 ? 8 : 4;
  let carry = 0;
  let dataAcc = 0;
  let pos = off;
  const end = data.length;
  const readCtrlBit = () => {
    dataAcc = dataAcc << 1 & 511;
    carry = dataAcc > 255 ? 1 : 0;
    dataAcc &= 255;
    if (dataAcc === 0) {
      if (pos >= end) return false;
      dataAcc = data[pos++];
      dataAcc = (dataAcc << 1) + 1 & 511;
      carry = dataAcc > 255 ? 1 : 0;
      dataAcc &= 255;
    }
    return true;
  };
  const shift = is16 ? 15 : 7;
  const mask = is16 ? 65535 : 255;
  for (let chn = 0; chn < numChannels; chn++) {
    let p = chn;
    const pEnd = length * numChannels;
    let previous = 0;
    while (p < pEnd) {
      let val = 0;
      if (is16) {
        if (dh < 5) {
          do {
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
          } while (carry);
        } else {
          do {
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
          } while (carry);
        }
      } else {
        do {
          if (!readCtrlBit()) return;
          val = (val << 1) + carry & mask;
          if (!readCtrlBit()) return;
        } while (carry);
      }
      let cl = dh;
      while (cl > 0) {
        if (!readCtrlBit()) return;
        val = (val << 1) + carry & mask;
        cl--;
      }
      let cl2 = 1;
      if (val >= 4) {
        cl2 = shift;
        while ((1 << cl2 & val) === 0 && cl2 > 1) cl2--;
      }
      dh = dh + cl2 >> 1;
      carry = val & 1;
      val >>= 1;
      if (carry === 0) val = ~val & mask;
      val = val + previous & mask;
      const signed = is16 ? val >= 32768 ? val - 65536 : val : val >= 128 ? val - 256 : val;
      dst[p] = signed;
      previous = signed;
      p += numChannels;
    }
  }
}
function unpackMo3DeltaPredictionSample(data, off, dst, length, numChannels, is16) {
  let dh = is16 ? 8 : 4;
  let carry = 0;
  let dataAcc = 0;
  let pos = off;
  const end = data.length;
  const readCtrlBit = () => {
    dataAcc = dataAcc << 1 & 511;
    carry = dataAcc > 255 ? 1 : 0;
    dataAcc &= 255;
    if (dataAcc === 0) {
      if (pos >= end) return false;
      dataAcc = data[pos++];
      dataAcc = (dataAcc << 1) + 1 & 511;
      carry = dataAcc > 255 ? 1 : 0;
      dataAcc &= 255;
    }
    return true;
  };
  const shift = is16 ? 15 : 7;
  const mask = is16 ? 65535 : 255;
  const minV = is16 ? -32768 : -128;
  const maxV = is16 ? 32767 : 127;
  for (let chn = 0; chn < numChannels; chn++) {
    let p = chn;
    const pEnd = length * numChannels;
    let next = 0;
    let previous = 0;
    while (p < pEnd) {
      let val = 0;
      if (is16) {
        if (dh < 5) {
          do {
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
          } while (carry);
        } else {
          do {
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
            if (!readCtrlBit()) return;
            val = (val << 1) + carry & mask;
          } while (carry);
        }
      } else {
        do {
          if (!readCtrlBit()) return;
          val = (val << 1) + carry & mask;
          if (!readCtrlBit()) return;
        } while (carry);
      }
      let cl = dh;
      while (cl > 0) {
        if (!readCtrlBit()) return;
        val = (val << 1) + carry & mask;
        cl--;
      }
      let cl2 = 1;
      if (val >= 4) {
        cl2 = shift;
        while ((1 << cl2 & val) === 0 && cl2 > 1) cl2--;
      }
      dh = dh + cl2 >> 1;
      carry = val & 1;
      val >>= 1;
      if (carry === 0) val = ~val & mask;
      const delta = val >= 32768 ? val - 65536 : val >= 128 ? val - 256 : val;
      val = val + next & mask;
      const out = val >= 32768 ? val - 65536 : val >= 128 ? val - 256 : val;
      dst[p] = out;
      p += numChannels;
      const sval = out;
      next = sval * 2 + (delta >> 1) - previous;
      if (next < minV) next = minV;
      if (next > maxV) next = maxV;
      previous = sval;
    }
  }
}
function decodeMp3Sample(data, off, size, encoderDelay, hdrLength, stereo, is16) {
  const dec = {
    mdctOverlap: [],
    qmfState: new Float32Array(0),
    reserv: 0,
    freeFormatBytes: 0,
    header: new Uint8Array(4),
    reservBuf: new Uint8Array(0)
  };
  mp3decInit(dec);
  const mp3 = data.subarray(off, off + size);
  const pcm = new Int16Array(1152 * 2);
  const info = { frameBytes: 0, channels: 0, hz: 0, layer: 0, bitrateKbps: 0 };
  let mpegData = mp3;
  const frame = parseMPEGFrame(mp3, 0);
  let encoderDelay2 = encoderDelay;
  if (frame && frame.isLAME) {
    const frameDelay = frame.numSamples * 2;
    if (encoderDelay >= frameDelay) {
      encoderDelay2 -= frameDelay;
      mpegData = mp3.subarray(frame.frameSize);
    }
  }
  const chunks = [];
  let pos = 0;
  let total = 0;
  let channels = 0;
  let hz = 0;
  let bytesLeft = mpegData.length;
  do {
    const n = mp3decDecodeFrame(dec, mpegData.subarray(pos), bytesLeft, pcm, info);
    if (n < 0 || info.frameBytes < 0) break;
    if (n > 0 && info.frameBytes === 0) break;
    if (n === 0 && info.frameBytes === 0) break;
    if (info.frameBytes > 0) {
      if (hz !== 0 && hz !== info.hz) break;
      if (channels !== 0 && channels !== info.channels) break;
      hz = info.hz;
      channels = info.channels;
      if (hz <= 0) break;
      if (channels !== 1 && channels !== 2) break;
      const advance = Math.min(Math.max(info.frameBytes, 0), bytesLeft);
      pos += advance;
      bytesLeft -= advance;
      if (n > 0) {
        chunks.push(pcm.slice(0, n * channels));
        total += n * channels;
      }
    }
    if (total / channels > 16777216) break;
  } while (bytesLeft > 0);
  if (total === 0) return null;
  const all = new Int16Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  let delay = encoderDelay2;
  if (delay > 0 && delay < all.length) {
    all.copyWithin(0, delay);
    total -= delay;
  }
  const samplesPerCh = Math.min(Math.floor(total / (channels || 1)), hdrLength);
  void stereo;
  void is16;
  return { pcm: all.subarray(0, samplesPerCh * (channels || 1)), channels: channels || 1, hz };
}
function mo3LoopFlags(flags) {
  const SMP_LOOP = 16, SMP_PINGPONG = 32, SMP_SUSTAIN = 256, SMP_SUSTAIN_PINGPONG = 512;
  return ((flags & SMP_LOOP) !== 0 ? 2 : 0) | // SampleFlags.LOOP
  ((flags & SMP_PINGPONG) !== 0 ? 2 | 4 : 0) | // LOOP | BIDIR
  ((flags & SMP_SUSTAIN) !== 0 ? 32 : 0) | // SUSTAIN
  ((flags & SMP_SUSTAIN_PINGPONG) !== 0 ? 32 | 64 : 0);
}
function mo3Load(bytes, ctx) {
  const fail = (msg) => {
    throw new ParseError(msg);
  };
  const parsed = parseMO3(bytes, fail);
  const { mod, sampleChunks, sampleHeaders, version } = parsed;
  const isXm = mod.readEventType === ReadEventType.FT2;
  const rawSamples = [];
  for (let smp = 0; smp < sampleHeaders.length; smp++) {
    const h = sampleHeaders[smp];
    const chunk = sampleChunks[smp];
    const stereo = (h.flags & SMP_STEREO) !== 0;
    const is16 = (h.flags & SMP_16BIT) !== 0;
    const numChannels = stereo ? 2 : 1;
    const compression = h.flags & SMP_COMPRESSION_MASK;
    let raw;
    if (h.compressedSize < 0 && smp + h.compressedSize > 0) {
      raw = {
        name: "",
        data: new Uint8Array(0),
        length: 0,
        loopStart: h.loopStart,
        loopEnd: h.loopEnd,
        sustainStart: h.sustainStart,
        sustainEnd: h.sustainEnd,
        finetune: 0,
        volume: Math.min(h.volume, 64),
        flags: mo3LoopFlags(h.flags),
        c5spd: C4_NTSC_RATE
      };
    } else if (h.length === 0 || chunk.size === 0) {
      raw = {
        name: "",
        data: new Uint8Array(0),
        length: 0,
        loopStart: h.loopStart,
        loopEnd: h.loopEnd,
        sustainStart: h.sustainStart,
        sustainEnd: h.sustainEnd,
        finetune: 0,
        volume: Math.min(h.volume, 64),
        flags: mo3LoopFlags(h.flags),
        c5spd: C4_NTSC_RATE
      };
    } else if (compression === 0 && h.compressedSize === 0) {
      const frames = h.length;
      const byteLen = frames * (is16 ? 2 : 1) * numChannels;
      raw = {
        name: "",
        data: bytes.subarray(chunk.off, chunk.off + byteLen),
        length: frames,
        loopStart: h.loopStart,
        loopEnd: h.loopEnd,
        sustainStart: h.sustainStart,
        sustainEnd: h.sustainEnd,
        finetune: 0,
        volume: Math.min(h.volume, 64),
        flags: mo3LoopFlags(h.flags) | (is16 ? 1 : 0) | (stereo ? 128 : 0),
        c5spd: C4_NTSC_RATE
      };
    } else if (compression === SMP_DELTA_COMPRESSION || compression === SMP_DELTA_PREDICTION) {
      const total = h.length * numChannels;
      const buf = is16 ? new Int16Array(total) : new Int8Array(total);
      if (compression === SMP_DELTA_COMPRESSION) {
        unpackMo3DeltaSample(chunk.data, chunk.off, buf, h.length, numChannels, is16);
      } else {
        unpackMo3DeltaPredictionSample(chunk.data, chunk.off, buf, h.length, numChannels, is16);
      }
      const byteLen = total * (is16 ? 2 : 1);
      const out = new Uint8Array(byteLen);
      const dv = new DataView(out.buffer);
      for (let i = 0; i < total; i++) {
        if (is16) dv.setInt16(i * 2, buf[i], true);
        else out[i] = buf[i] & 255;
      }
      raw = {
        name: "",
        data: out,
        length: h.length,
        loopStart: h.loopStart,
        loopEnd: h.loopEnd,
        sustainStart: h.sustainStart,
        sustainEnd: h.sustainEnd,
        finetune: 0,
        volume: Math.min(h.volume, 64),
        flags: mo3LoopFlags(h.flags) | (is16 ? 1 : 0),
        c5spd: C4_NTSC_RATE
      };
      if (stereo) raw.flags |= 128;
    } else if (compression === SMP_COMPRESSION_MPEG) {
      const res = decodeMp3Sample(chunk.data, chunk.off, chunk.size, h.encoderDelay, h.length, stereo, is16);
      if (!res) {
        raw = {
          name: "",
          data: new Uint8Array(0),
          length: 0,
          loopStart: h.loopStart,
          loopEnd: h.loopEnd,
          sustainStart: h.sustainStart,
          sustainEnd: h.sustainEnd,
          finetune: 0,
          volume: Math.min(h.volume, 64),
          flags: mo3LoopFlags(h.flags),
          c5spd: C4_NTSC_RATE
        };
      } else {
        const ch = res.channels;
        const bytesPer = 2;
        const out = new Uint8Array(res.pcm.length * bytesPer);
        const dv = new DataView(out.buffer);
        for (let i = 0; i < res.pcm.length; i++) dv.setInt16(i * 2, res.pcm[i], true);
        raw = {
          name: "",
          data: out,
          length: Math.floor(res.pcm.length / ch),
          loopStart: h.loopStart,
          loopEnd: h.loopEnd,
          sustainStart: h.sustainStart,
          sustainEnd: h.sustainEnd,
          finetune: 0,
          volume: Math.min(h.volume, 64),
          flags: mo3LoopFlags(h.flags) | 1 | (ch === 2 ? 128 : 0),
          c5spd: res.hz
        };
      }
    } else if (compression === SMP_COMPRESSION_OGG || compression === SMP_SHARED_OGG) {
      let merged = null;
      let sharedHeader = false;
      if (compression === SMP_SHARED_OGG) {
        const sharedHeaderSize = h.encoderDelay;
        const sharedOggHeader = smp + h.sharedOggHeader > 0 ? smp + h.sharedOggHeader : smp;
        sharedHeader = sharedOggHeader !== smp && sharedOggHeader > 0 && sharedOggHeader <= sampleHeaders.length && sharedHeaderSize > 0;
        if (sharedHeader) {
          const head = sampleChunks[sharedOggHeader - 1];
          merged = mergeSharedOggHeader(head.data.subarray(head.off, head.off + sharedHeaderSize), sharedHeaderSize, chunk.data, chunk.off, chunk.size);
        }
      }
      if (!merged) {
        merged = chunk.data.subarray(chunk.off, chunk.off + chunk.size);
      }
      const pcm = decodeOggStream(merged, h.length, numChannels);
      if (!pcm || pcm.length === 0) {
        raw = {
          name: "",
          data: new Uint8Array(0),
          length: 0,
          loopStart: h.loopStart,
          loopEnd: h.loopEnd,
          sustainStart: h.sustainStart,
          sustainEnd: h.sustainEnd,
          finetune: 0,
          volume: Math.min(h.volume, 64),
          flags: mo3LoopFlags(h.flags),
          c5spd: C4_NTSC_RATE
        };
      } else {
        const frames = Math.floor(pcm.length / numChannels);
        const out = new Uint8Array(pcm.length * 2);
        const dv = new DataView(out.buffer);
        for (let i = 0; i < pcm.length; i++) {
          let v = pcm[i];
          v = v < -1 ? -1 : v > 1 ? 1 : v;
          v *= 32768;
          const r = v >= 0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5);
          dv.setInt16(i * 2, Math.max(-32768, Math.min(32767, r)), true);
        }
        raw = {
          name: "",
          data: out,
          length: frames,
          loopStart: h.loopStart,
          loopEnd: h.loopEnd,
          sustainStart: h.sustainStart,
          sustainEnd: h.sustainEnd,
          finetune: 0,
          volume: Math.min(h.volume, 64),
          flags: mo3LoopFlags(h.flags) | 1 | (stereo ? 128 : 0),
          c5spd: C4_NTSC_RATE
        };
      }
    } else {
      raw = {
        name: "",
        data: new Uint8Array(0),
        length: 0,
        loopStart: h.loopStart,
        loopEnd: h.loopEnd,
        sustainStart: h.sustainStart,
        sustainEnd: h.sustainEnd,
        finetune: 0,
        volume: Math.min(h.volume, 64),
        flags: mo3LoopFlags(h.flags),
        c5spd: C4_NTSC_RATE
      };
    }
    if (isXm) {
      raw.finetune = h.finetune - 128 << 24 >> 24;
      raw.flags |= 0;
    }
    ctx.addSample(raw);
    rawSamples.push(raw);
  }
  mod.samples = rawSamples;
  if (isXm) {
    for (const ins of mod.instruments) {
      if (ins.sub.length !== 0) continue;
      const used = /* @__PURE__ */ new Set();
      for (let k = 12; k < 108; k++) {
        const sid = ins.map[k];
        if (sid !== 255 && sid !== 0) used.add(sid);
      }
      const subIndexBySid = /* @__PURE__ */ new Map();
      let n = 0;
      for (const sid of used) {
        const h = sampleHeaders[sid];
        if (!h) continue;
        ins.sub.push({
          vol: Math.min(h.volume, 64),
          gvl: 64,
          pan: h.panning <= 256 ? h.panning : -1,
          xpo: h.transpose,
          fin: h.finetune - 128 << 24 >> 24,
          vwf: 0,
          vde: 0,
          vra: 0,
          vsw: 0,
          sid,
          rvv: 0,
          nna: 0,
          dct: 0,
          dca: 0,
          ifc: 0,
          ifr: 0
        });
        subIndexBySid.set(sid, n);
        n++;
      }
      if (n === 0) {
        ins.sub.push({
          vol: 0,
          gvl: 64,
          pan: -1,
          xpo: 0,
          fin: 0,
          vwf: 0,
          vde: 0,
          vra: 0,
          vsw: 0,
          sid: 0,
          rvv: 0,
          nna: 0,
          dct: 0,
          dca: 0,
          ifc: 0,
          ifr: 0
        });
      } else {
        for (let k = 12; k < 108; k++) {
          const sid = ins.map[k];
          ins.map[k] = subIndexBySid.get(sid) ?? 255;
        }
      }
      ins.nsm = ins.sub.length;
    }
  }
  void version;
  return mod;
}
var plugin = {
  name: "mo3",
  test: mo3Test,
  load: mo3Load,
  readEvent(core, chn, row) {
    const mod = core.module;
    void mod;
    void chn;
    void row;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    void e;
    dispatchReadEvent(core, chn, row);
  }
};
function dispatchReadEvent(core, chn, row) {
  fmtModReadEvent(core, chn, row);
}
export {
  mo3Load,
  mo3Test,
  mp3decDecodeFrame,
  mp3decInit,
  plugin
};
